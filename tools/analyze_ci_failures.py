#!/usr/bin/env python3
"""Analyze CI failures related."""
# ruff: noqa: T201

from __future__ import annotations

import os
import re
import subprocess  # noqa: S404
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.request import Request, urlopen

import github

if TYPE_CHECKING:
    from github.Issue import Issue
    from github.Repository import Repository
    from github.WorkflowJob import WorkflowJob
    from github.WorkflowRun import WorkflowRun
    from github.WorkflowStep import WorkflowStep
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


def fetch_job_logs(
    repo_full_name: str, job_id: int, token: str, timeout: int = 30
) -> str | None:
    """Download job logs via GitHub API.

    Returns:
        Log text or None on failure.
    """
    owner, repo_name = repo_full_name.split("/", 1)
    url = f"https://api.github.com/repos/{owner}/{repo_name}/actions/jobs/{job_id}/logs"
    req = Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        },
    )
    try:
        with urlopen(req, timeout=timeout) as resp:  # noqa: S310
            # API may redirect to the actual log URL
            if resp.status in {301, 302, 307, 308}:
                redirect_url = resp.headers.get("Location")
                if redirect_url:
                    req_redirect = Request(  # noqa: S310
                        redirect_url, headers={"Accept": "application/vnd.github+json"}
                    )
                    resp = urlopen(req_redirect, timeout=timeout)  # noqa: S310
            data = resp.read()
    except (OSError, ValueError):
        return None
    if data[:2] == b"PK":
        # Zip archive (typical for job logs)
        try:
            with zipfile.ZipFile(BytesIO(data), "r") as zf:
                parts = [
                    zf.read(name).decode("utf-8", errors="replace")
                    for name in sorted(zf.namelist())
                    if name.endswith(".txt")
                ]
                return "\n".join(parts) if parts else None
        except (zipfile.BadZipFile, OSError, ValueError):
            return None
    return data.decode("utf-8", errors="replace")


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
        print(f"Updated issue #{issue.number} : {issue.html_url}")
    else:
        issue = repo.create_issue(
            title=DASHBOARD_ISSUE_TITLE, body=body, assignee=ASSIGNEE, labels=LABELS
        )
        print(
            f"Created new CI Status Dashboard issue #{issue.number}: {issue.html_url}"
        )


def get_failed_step_names(job: WorkflowJob) -> list[str]:
    """Return step names that failed in this job (conclusion == 'failure')."""
    try:
        steps: list[WorkflowStep] = job.steps
    except Exception as e:  # noqa: BLE001
        print(f"  Warning: Failure fetch steps for job {job.id}: {e}")
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
        print(
            "Error: Set GH_TOKEN or GITHUB_TOKEN, or run 'gh auth login'",
            file=sys.stderr,
        )
        return 1

    repo_name = detect_repo_name()
    if not repo_name:
        print(
            "Error: Could not detect repository. Set GITHUB_REPOSITORY (e.g. owner/repo), "
            "run from a repo with 'gh' CLI configured, or use a git remote origin pointing to GitHub.",
            file=sys.stderr,
        )
        return 1
    days_back = DAYS_BACK
    output_file = OUTPUT_FILE
    output_file.parent.mkdir(parents=True, exist_ok=True)

    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    print(f"Fetching workflow runs from the last {days_back} days: >={cutoff_date} ...")
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
            print(
                f"Workflow run {r.name} {r.workflow_id} on {r.event} => {r.conclusion} {r.display_title}"
            )
    total_runs = len(runs_in_range)
    failed_runs = [r for r in runs_in_range if r.conclusion == "failure"]
    success_count = sum(1 for r in runs_in_range if r.conclusion == "success")
    cancelled_count = sum(1 for r in runs_in_range if r.conclusion == "cancelled")

    md_report = (
        "# CI Failure Analysis Report\n\n"
        f"Analysis of last {days_back} days CI failures on runs that should never fail.\n\n"
        f"Generated on: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
    )

    lightspeed_entries: list[
        tuple[str, str, str, str, str, str, int, str, str, str]
    ] = []
    other_entries: list[tuple[str, str, str, str, str, str, str]] = []
    lightspeed_count = 0
    other_count = 0
    step_failures: dict[str, int] = {}
    total_failed_jobs = 0

    for idx, run in enumerate(failed_runs, 1):
        print(f"[{idx}/{len(failed_runs)}] Analyzing run {run.id}...")
        try:
            jobs: list[WorkflowJob] = list(run.jobs())
        except Exception as e:  # noqa: BLE001
            print(f"  Warning: Could not fetch jobs for run {run.id}: {e}")
            continue
        failed_jobs = [j for j in jobs if j.conclusion == "failure"]
        if not failed_jobs:
            print("  No failed jobs found")
            continue

        total_failed_jobs += len(failed_jobs)
        for j in failed_jobs:
            for step_name in get_failed_step_names(j):
                print(f"  Step '{step_name}' failed in job {j.name} (ID: {j.id})")
                step_failures[step_name] = step_failures.get(step_name, 0) + 1

        run_title = run.display_title or str(run.id)
        run_branch = run.head_branch or ""
        run_url = run.html_url or ""
        run_date = run.created_at.isoformat() if run.created_at else ""

        found_lightspeed = False
        for job in failed_jobs:
            print(f"  Checking job: {job.name} (ID: {job.id})")
            log_text = fetch_job_logs(repo_name, job.id, token)
            if log_text is None:
                print(f"    Warning: Could not fetch log for job {job.id}")
                continue
            if LIGHTSPEED_PATTERN.search(log_text):
                print("    Found lightspeed test FAILURE!")
                found_lightspeed = True
                context = extract_failure_context(log_text)
                job_url = (
                    getattr(job, "html_url", None)
                    or f"https://github.com/{repo_name}/actions/runs/{run.id}"
                )
                failed_steps = get_failed_step_names(job)
                failed_step_str = ", ".join(failed_steps) if failed_steps else "—"
                lightspeed_entries.append((
                    str(run.id),
                    run_title,
                    run_branch,
                    run_url,
                    run_date,
                    job.name,
                    job.id,
                    job_url,
                    context,
                    failed_step_str,
                ))
                lightspeed_count += 1
                break

        if not found_lightspeed:
            other_count += 1
            failed_job_names = ",".join(j.name for j in failed_jobs)
            step_parts = [
                f"{j.name}: {', '.join(get_failed_step_names(j)) or '—'}"
                for j in failed_jobs
            ]
            failed_step_summary = "; ".join(step_parts)
            other_entries.append((
                str(run.id),
                run_title,
                run_branch,
                run_url,
                run_date,
                failed_job_names,
                failed_step_summary,
            ))

    if total_runs == 0:
        print(f"No runs found in the last {days_back} days", file=sys.stderr)
        return 1

    md_summary = (
        "## Summary\n\n"
        f"- **Total failure rate**: {len(failed_runs) / total_runs * 100:.1f}%\n"
        f"- **Total runs**: {total_runs}\n"
        f"- **Successful**: {success_count}\n"
        f"- **Failed**: {len(failed_runs)}\n"
        f"- **Cancelled**: {cancelled_count}\n\n"
        f"- **Failures caused by Lightspeed tests**: {lightspeed_count} ({lightspeed_count / total_runs * 100:.1f}%)\n"
        f"- **Other failures**: {other_count}\n"
    )
    md_report += md_summary
    if failed_runs:
        pct = (lightspeed_count / len(failed_runs)) * 100
        md_report += (
            f"- **Percentage of failures due to Lightspeed tests**: {pct:.1f}%\n"
        )

    # Detailed: Lightspeed failures
    md_report += "## Detailed Analysis\n\n### Failures Related to Lightspeed Tests\n\n"
    if not lightspeed_entries:
        md_report += "No failures related to lightspeed tests found.\n"
    else:
        for (
            run_id,
            title,
            branch,
            url,
            date,
            job_name,
            _job_id,
            job_url,
            context,
            failed_step_str,
        ) in lightspeed_entries:
            md_report += (
                f"#### Run #{run_id} - {title}\n\n"
                f"- **Branch**: `{branch}`\n"
                f"- **Date**: {date}\n"
                f"- **Failed Job**: {job_name}\n"
                f"- **Failed step(s)**: {failed_step_str}\n"
                f"- **Run URL**: {url}\n"
                f"- **Job URL**: {job_url}\n\n"
            )
            if context:
                md_report += (
                    "<details>\n"
                    "<summary>Failure Details</summary>\n\n"
                    "```\n"
                    f"{context}\n"
                    "```\n"
                    "</details>\n\n"
                )

    md_report += "\n### Other Failures (Not Related to Lightspeed Tests)\n\n"
    if not other_entries:
        md_report += "No other failures found.\n"
    else:
        for (
            run_id,
            title,
            branch,
            url,
            date,
            failed_job_names,
            failed_step_summary,
        ) in other_entries:
            md_report += (
                f"- Run #{run_id}: **{title}** (`{branch}`) - Failed jobs: {failed_job_names}\n"
                f"  - Failed step(s): {failed_step_summary}\n"
                f"  - URL: {url}\n"
                f"  - Date: {date}\n"
            )

    # Failure rate per step name
    md_report += "\n## Failure rate per step name\n\n"
    if not step_failures or total_failed_jobs == 0:
        md_report += "No step-level failure data available.\n"
    else:
        md_report += f"Failure count and rate by step (out of {total_failed_jobs} failed job(s)).\n\n"
        for step_name in sorted(step_failures.keys(), key=lambda s: -step_failures[s]):
            count = step_failures[step_name]
            pct = (count / total_failed_jobs) * 100
            md_report += f"- **{step_name}**: {count} ({pct:.1f}%)\n"

    output_file.write_text(md_report, encoding="utf-8")
    print(f"Report generated: {output_file}\n{md_summary}")

    update_or_create_ci_dashboard(gh, repo, md_report, passing=len(failed_runs) == 0)
    return 0


if __name__ == "__main__":
    sys.exit(main())
