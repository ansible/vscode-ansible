#!/usr/bin/env python3
"""Analyze CI failures related."""

from __future__ import annotations

import logging
import os
import re
import subprocess  # noqa: S404
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING

import github

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

if TYPE_CHECKING:
    from github.Issue import Issue
    from github.Repository import Repository
    from github.WorkflowJob import WorkflowJob
    from github.WorkflowRun import WorkflowRun
    from github.WorkflowStep import WorkflowStep


@dataclass(order=True)
class FailureEntry:
    """Represents a CI failure."""

    # Sort keys (sorted by area first, then title)
    area: str = ""
    failed_steps: str = field(default="")
    failed_jobs: str = field(default="")
    title: str = field(default="")
    # Non-comparison fields
    run_id: str = field(default="", compare=False)
    branch: str = field(default="", compare=False)
    url: str = field(default="", compare=False)
    date: str = field(default="", compare=False)
    # Fields specific to Lightspeed test failures
    job_id: int | None = field(default=None, compare=False)
    job_url: str | None = field(default=None, compare=False)
    context: str | None = field(default=None, compare=False)


OUT_DIR = Path("out")
DAYS_BACK = 7
OUTPUT_FILE = OUT_DIR / "ci_failure_report.md"
DASHBOARD_ISSUE_TITLE = "CI Status Dashboard"
EVENT_TYPES = {"schedule", "push"}
ASSIGNEE = ""
LABELS = ["task"]

# Git remote URL pattern: github.com/owner/repo or git@github.com:owner/repo
_GIT_REMOTE_GITHUB_RE = re.compile(
    r"(?:https?://github\.com/|git@github\.com:)([^/]+)/([^/\s]+?)(?:\.git)?$"
)


def detect_repo_name() -> str | None:
    """Detect GitHub owner/repo (e.g. 'ansible/vscode-ansible').

    Tries, in order: GITHUB_REPOSITORY env, `gh repo view`, git remote origin.

    Returns:
        owner/repo string, or None if detection failed.
    """
    env = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if env and "/" in env:
        return env

    try:
        result = subprocess.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
            cwd=Path.cwd(),
        )
        out = (result.stdout or "").strip()
        if out and "/" in out:
            return out
    except (
        subprocess.CalledProcessError,
        FileNotFoundError,
        subprocess.TimeoutExpired,
    ):
        pass

    try:
        result = subprocess.run(
            ["git", "remote", "get-url", "origin"],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
            cwd=Path.cwd(),
        )
        url = (result.stdout or "").strip()
        m = _GIT_REMOTE_GITHUB_RE.search(url)
        if m:
            return f"{m.group(1)}/{m.group(2)}"
    except (
        subprocess.CalledProcessError,
        FileNotFoundError,
        subprocess.TimeoutExpired,
    ):
        pass

    return None


LIGHTSPEED_PATTERN = re.compile(
    r"FAILED.*(test_lightspeed\.py|test_lightspeed_trial\.py)|"
    r"(test_lightspeed\.py|test_lightspeed_trial\.py).*FAILED|"
    r"ERROR.*(test_lightspeed\.py|test_lightspeed_trial\.py)"
)


def fetch_job_logs(repo_full_name: str, job_id: int, timeout: int = 30) -> str | None:
    """Download job logs via GitHub API.

    WARNING, Using API or even the browser does not seem to work as we get:

    HTTP Error 403: Server failed to authenticate the request. Make sure the value of Authorization header is formed correctly including the signature.

    But using `gh` cli to retrieve the logs seems to work.

    Returns:
        Log text or None on failure.
    """
    owner, repo_name = repo_full_name.split("/", 1)
    # url = f"https://api.github.com/repos/{owner}/{repo_name}/actions/jobs/{job_id}/logs"
    cmd = f"gh api /repos/{owner}/{repo_name}/actions/jobs/{job_id}/logs"
    data = ""
    try:
        data = subprocess.check_output(  # noqa: S602
            cmd,
            shell=True,
            text=True,
            encoding="utf-8",
            timeout=timeout,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to extract logs for job %s: %s", job_id, e)
        return None
    return data


def update_or_create_ci_dashboard(
    gh: github.Github, repo: Repository, body: str, *, passing: bool
) -> None:
    """Update existing CI Status Dashboard issue or create one with body as content.

    Expects repo to have .full_name and .create_issue(title=..., body=...).
    """
    query = f"{DASHBOARD_ISSUE_TITLE} in:title repo:{repo.full_name}"
    results: list[Issue] = list(gh.search_issues(query))
    state_reason = "completed" if passing else "reopened"
    title_suffix = "✅" if passing else "❌"
    # https://github.com/github/docs/issues/19593#issuecomment-1367777932
    if results:
        issue = results[0]
        issue.edit(
            title=f"{DASHBOARD_ISSUE_TITLE} {title_suffix}",
            body=body,
            assignee=ASSIGNEE,
            labels=LABELS,
            state_reason=state_reason,
        )
        msg = f"Updated issue #{issue.number} : {issue.html_url}"
        logger.info(msg)
    else:
        issue = repo.create_issue(
            title=DASHBOARD_ISSUE_TITLE, body=body, assignee=ASSIGNEE, labels=LABELS
        )
        msg = f"Created new CI Status Dashboard issue #{issue.number}: {issue.html_url}"
        logger.info(msg)


def get_failed_step_names(job: WorkflowJob) -> list[str]:
    """Return step names that failed in this job (conclusion == 'failure')."""
    try:
        steps: list[WorkflowStep] = job.steps
    except Exception as e:  # noqa: BLE001
        msg = f"Failure fetch steps for job {job.id}: {e}"
        logger.warning(msg)
        return []
    # keep in mind that .outcome might fail but if continue-on-error is set, conclusion will be success
    return [s.name for s in steps if getattr(s, "conclusion", None) == "failure"]


def extract_failure_context(log_text: str, max_lines: int = 30) -> str:
    """Extract lines matching LIGHTSPEED_PATTERN with surrounding context.

    Returns:
        Up to max_lines of context around matches, or empty string.
    """
    lines = log_text.splitlines()
    result = []
    for i, line in enumerate(lines):
        if LIGHTSPEED_PATTERN.search(line):
            start = max(0, i - 5)
            end = min(len(lines), i + 11)
            result.extend(lines[start:end])
            if len(result) >= max_lines:
                break
    return "\n".join(result[:max_lines]) if result else ""


def main() -> int:  # noqa: C901, PLR0912, PLR0915, PLR0914, D103
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        try:
            result = subprocess.run(
                ["gh", "auth", "token"],  # noqa: S607
                capture_output=True,
                text=True,
                check=True,
                timeout=5,
            )
            token = (result.stdout or "").strip()
        except (
            subprocess.CalledProcessError,
            FileNotFoundError,
            subprocess.TimeoutExpired,
        ):
            token = ""
    if not token:
        logger.error("Set GH_TOKEN or GITHUB_TOKEN, or run 'gh auth login'")
        return 1

    repo_name = detect_repo_name()
    if not repo_name:
        logger.error(
            "Could not detect repository. Set GITHUB_REPOSITORY (e.g. owner/repo), "
            "run from a repo with 'gh' CLI configured, or use a git remote origin pointing to GitHub."
        )
        return 1
    days_back = DAYS_BACK
    output_file = OUTPUT_FILE
    output_file.parent.mkdir(parents=True, exist_ok=True)

    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    logger.info(
        "Fetching workflow runs from the last %s days: >=%s ...", days_back, cutoff_date
    )
    gh = github.Github(auth=github.Auth.Token(token))
    repo = gh.get_repo(repo_name)
    default_branch = repo.get_branch(repo.default_branch)
    runs_in_range: list[WorkflowRun] = []
    for event_type in EVENT_TYPES:
        for r in repo.get_workflow_runs(
            branch=default_branch,
            event=event_type,
            created=f">={cutoff_date}",
        ):
            runs_in_range.append(r)
            logger.info(
                "Workflow run %s %s on %s => %s %s",
                r.name,
                r.workflow_id,
                r.event,
                r.conclusion,
                r.display_title,
            )
    total_runs = len(runs_in_range)
    failed_runs = [r for r in runs_in_range if r.conclusion == "failure"]
    success_count = sum(1 for r in runs_in_range if r.conclusion == "success")
    cancelled_count = sum(1 for r in runs_in_range if r.conclusion == "cancelled")

    md_report = (
        "# CI Failure Analysis Report\n\n"
        f"Analysis of last {days_back} days CI failures on runs that should never fail.\n\n"
    )

    failure_entries: list[FailureEntry] = []
    step_failures: dict[str, int] = {}
    total_failed_jobs = 0

    for idx, run in enumerate(failed_runs, 1):
        logger.info("[%d/%d] Analyzing run %s...", idx, len(failed_runs), run.id)
        try:
            jobs: list[WorkflowJob] = list(run.jobs())
        except Exception as e:  # noqa: BLE001
            logger.warning("  Could not fetch jobs for run %s: %s", run.id, e)
            continue
        failed_jobs = [j for j in jobs if j.conclusion == "failure"]
        if not failed_jobs:
            logger.info("  No failed jobs found")
            continue

        total_failed_jobs += len(failed_jobs)
        for j in failed_jobs:
            for step_name in get_failed_step_names(j):
                logger.info(
                    "Step '%s' failed in job %s (ID: %s)", step_name, j.name, j.id
                )
                step_failures[step_name] = step_failures.get(step_name, 0) + 1

        run_title = run.display_title or str(run.id)
        run_branch = run.head_branch or ""
        run_url = run.html_url or ""
        run_date = run.created_at.isoformat() if run.created_at else ""
        area = ""
        job_url = run_url
        context = ""

        for job in failed_jobs:
            logger.info("Checking job: %s (ID: %s)", job.name, job.id)
            log_text = fetch_job_logs(repo_name, job.id)
            if log_text is None:
                logger.warning("Could not fetch log for job %s", job.id)
                continue
            if LIGHTSPEED_PATTERN.search(log_text):
                logger.info("Found lightspeed test FAILURE!")
                context = extract_failure_context(log_text)
                job_url = (
                    getattr(job, "html_url", None)
                    or f"https://github.com/{repo_name}/actions/runs/{run.id}"
                )
                area = "lightspeed"
                break
        failed_steps = get_failed_step_names(job)
        failed_step_str = ", ".join(failed_steps) if failed_steps else "—"
        failed_job_names = ",".join(j.name for j in failed_jobs)

        failure_entries.append(
            FailureEntry(
                run_id=str(run.id),
                title=run_title,
                branch=run_branch,
                url=run_url,
                date=run_date,
                failed_jobs=failed_job_names,
                failed_steps=failed_step_str,
                job_id=job.id,
                job_url=job_url,
                context=context,
                area=area,
            )
        )
    failure_entries.sort()

    # Produce details report, grouping by area
    last_area = ""
    area_counter: dict[str, int] = {}

    md_details = "\n\n## Detailed Analysis: area > step > job\n\n"
    for entry in failure_entries:
        area_counter.setdefault(entry.area, 0)
        area_counter[entry.area] += 1
        if last_area != entry.area:
            md_details += f"\n\n### Area: {entry.area or 'Uncategorized'}\n\n"
        last_area = entry.area
        md_details += f"- `{entry.failed_steps}` {entry.failed_jobs} [{entry.title}]({entry.job_url})\n"
        if entry.context:
            md_details += (
                "<details>\n"
                "<summary>Failure Details</summary>\n\n"
                "```\n"
                f"{entry.context}\n"
                "```\n"
                "</details>\n\n"
            )
    if total_runs == 0:
        logger.info("No runs found in the last %s days", days_back)
        return 1

    md_summary = (
        "## Summary\n\n"
        f"- **Total failure rate**: {len(failed_runs) / total_runs * 100:.1f}%\n"
        f"- **Total runs**: {total_runs}\n"
        f"- **Successful**: {success_count}\n"
        f"- **Failed**: {len(failed_runs)}\n"
        f"- **Cancelled**: {cancelled_count}\n"
    )
    for area, count in area_counter.items():
        md_summary += f"- **{area or 'Uncategorized'}**: {count} ({count / total_runs * 100:.1f}%)\n"
    md_summary += "\n"

    md_report += md_summary
    # Failure rate per step name
    if step_failures or total_failed_jobs != 0:
        md_report += "\n## Failure rate per step name\n\n"

        md_report += "```mermaid\npie\n"
        for step_name in sorted(step_failures.keys(), key=lambda s: -step_failures[s]):
            count = step_failures[step_name]
            md_report += f'    "{step_name}": {count}\n'
        md_report += "```\n"

    md_report += md_details
    f"\n\nGenerated on: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n"

    output_file.write_text(md_report, encoding="utf-8")
    logger.info("Report generated: %s\n%s", output_file, md_summary)

    update_or_create_ci_dashboard(gh, repo, md_report, passing=len(failed_runs) == 0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
