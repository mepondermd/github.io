#!/usr/bin/env python3
"""Terminal app that runs classic Infocom Z-code games via dfrotz/frotz."""

from __future__ import annotations

import argparse
import os
import pty
import select
import shutil
import signal
import sys
import termios
import tty
from pathlib import Path


def find_interpreter() -> str | None:
    for name in ("dfrotz", "frotz"):
        path = shutil.which(name)
        if path:
            return path
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Z-code stories (.z3/.z5/.z8) through dfrotz/frotz in an interactive shell."
    )
    parser.add_argument("story", type=Path, help="Path to the Z-code story file")
    parser.add_argument(
        "--seed", type=int, default=None, help="Optional deterministic RNG seed passed to frotz"
    )
    return parser.parse_args()


def build_command(interpreter: str, args: argparse.Namespace) -> list[str]:
    cmd = [interpreter, "-m"]
    if args.seed is not None:
        cmd.extend(["-s", str(args.seed)])
    cmd.append(str(args.story))
    return cmd


def run_story(command: list[str]) -> int:
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp(command[0], command)

    old_attrs = termios.tcgetattr(sys.stdin.fileno())
    tty.setraw(sys.stdin.fileno())

    try:
        while True:
            readable, _, _ = select.select([fd, sys.stdin], [], [])
            if fd in readable:
                try:
                    data = os.read(fd, 4096)
                except OSError:
                    break
                if not data:
                    break
                sys.stdout.buffer.write(data)
                sys.stdout.flush()

            if sys.stdin in readable:
                chunk = os.read(sys.stdin.fileno(), 1024)
                if not chunk:
                    continue
                if chunk == b"\x03":  # Ctrl-C
                    os.kill(pid, signal.SIGINT)
                    continue
                os.write(fd, chunk)
    finally:
        termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, old_attrs)

    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)


def main() -> int:
    args = parse_args()
    if not args.story.exists():
        print(f"Story file not found: {args.story}", file=sys.stderr)
        return 2

    interpreter = find_interpreter()
    if interpreter is None:
        print(
            "No dfrotz/frotz interpreter found in PATH. Install one, then run this app again.",
            file=sys.stderr,
        )
        return 3

    command = build_command(interpreter, args)
    print(f"Launching: {' '.join(command)}")
    print("Press Ctrl-C to send interrupt to the game process.\n")
    return run_story(command)


if __name__ == "__main__":
    raise SystemExit(main())
