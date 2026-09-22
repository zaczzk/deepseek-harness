#!/usr/bin/env python3
"""Dispatch one coding task to the DeepSeek Harness and read its result.

This is the runnable example for orchestrators (Hermes and equivalents): it
invokes `dsh run`, parses the single JSON result object from stdout, prints a
one-line summary, saves the full result, and exits with `dsh run`'s exit code.

Usage:
    python dispatch.py --repo <path> --task-file <path> [--task <text>] [options]

Run `dsh run --help` for the full flag set and docs/user/guide/dsh-run.md for
the result schema and exit-code contract.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

HARNESS_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def dsh_command(launcher: str | None) -> list[str]:
    """Resolve the `dsh` launcher: an explicit override, or this checkout's source launch.

    The source launch runs `dsh` directly (never through a package manager), so
    stdout carries exactly the result object and nothing a wrapper prints.
    """
    if launcher is not None:
        return [launcher]
    return ["node", "--import", "tsx/esm", os.path.join(HARNESS_ROOT, "apps", "cli", "src", "bin.ts")]


def main() -> int:
    parser = argparse.ArgumentParser(description="dispatch one task through `dsh run`")
    parser.add_argument("--repo", required=True, help="target repository to work in")
    task_source = parser.add_mutually_exclusive_group(required=True)
    task_source.add_argument("--task-file", help="UTF-8 file holding the task text")
    task_source.add_argument("--task", help="task text inline")
    parser.add_argument("--push", action="store_true", help="push after the test gate passes")
    parser.add_argument("--test-cmd", help="the project's test command (default: discovered)")
    parser.add_argument("--timeout", help="wall-clock bound, such as 20m")
    parser.add_argument("--session-id", help="resume an interrupted run's session")
    parser.add_argument("--price-in-usd-per-mtok", help="declared input price in USD per million tokens")
    parser.add_argument("--price-out-usd-per-mtok", help="declared output price in USD per million tokens")
    parser.add_argument("--result-out", default="dsh-run-result.json", help="where to save the result object")
    parser.add_argument("--launcher", help="override the dsh launcher (a single executable name or path)")
    args = parser.parse_args()

    command = dsh_command(args.launcher) + [
        "run", "--cwd", args.repo, "--output", "json",
    ]
    command += ["--task-file", args.task_file] if args.task_file else ["--task", args.task]
    if args.push:
        command.append("--push")
    if args.test_cmd:
        command += ["--test-cmd", args.test_cmd]
    if args.timeout:
        command += ["--timeout", args.timeout]
    if args.session_id:
        command += ["--session-id", args.session_id]
    if args.price_in_usd_per_mtok:
        command += ["--price-in-usd-per-mtok", args.price_in_usd_per_mtok]
    if args.price_out_usd_per_mtok:
        command += ["--price-out-usd-per-mtok", args.price_out_usd_per_mtok]

    # dsh writes UTF-8; the locale codec would mangle non-ASCII answers on Windows.
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8")
    lines = [line for line in completed.stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        # The contract is exactly one result object; anything else is a broken
        # launcher, and the raw streams say why.
        print(f"dispatch: expected exactly one result line, got {len(lines)}", file=sys.stderr)
        print(completed.stderr, file=sys.stderr)
        print(completed.stdout, file=sys.stderr)
        return 3
    result = json.loads(lines[0])
    with open(args.result_out, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2)
        handle.write("\n")

    error = result.get("error")
    summary = result.get("outcome")
    if error:
        summary += f" ({error['code']})"
    print(
        f"dispatch: {summary} | session={result['session_id']} | exit={result['exit_code']} "
        f"| tests={result['tests']['status']} | pushed={result['push']['pushed']} "
        f"| files={len(result['files_changed'] or [])} | turns={result['turns']}"
    )
    return result["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
