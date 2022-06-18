"""Print summary after running docs."""
import pathlib
import os
import sys

if __name__ == "__main__":
    docs_dir = pathlib.Path("out") / "docs_out"
    index_file = (docs_dir / "index.html").absolute()
    print(f"""
Documentation index: file://{index_file}
To serve docs, run: python3 -m http.server --directory "{docs_dir}" 0""")

    # when interactive, also open docs inside the default browser
    if sys.stdout.isatty():
        CMD = "xdg-open"
        if sys.platform == "darwin":
            CMD = "open"
        elif sys.platform == "win32":
            CMD = "explorer"
        os.system(f"{CMD} {index_file}")
