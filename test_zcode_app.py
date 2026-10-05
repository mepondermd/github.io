"""Focused regression tests for terminal handling in zcode_app."""

import io
import unittest
from unittest import mock

import zcode_app


class RunStoryTests(unittest.TestCase):
    def test_non_tty_stdin_exits_before_forking(self):
        stdin = mock.Mock()
        stdin.fileno.return_value = 7
        stdin.isatty.return_value = False

        with (
            mock.patch.object(zcode_app.sys, "stdin", stdin),
            mock.patch.object(zcode_app.pty, "fork") as fork,
            mock.patch("sys.stderr", new_callable=io.StringIO) as stderr,
        ):
            result = zcode_app.run_story(["dfrotz", "story.z5"])

        self.assertEqual(result, 4)
        self.assertIn("stdin is not a TTY", stderr.getvalue())
        fork.assert_not_called()

    def test_tcgetattr_runs_before_fork(self):
        stdin = mock.Mock()
        stdin.fileno.return_value = 7
        stdin.isatty.return_value = True
        events = []

        def get_attrs(fd):
            events.append("tcgetattr")
            return [0]

        def fork():
            events.append("fork")
            return 123, 9

        with (
            mock.patch.object(zcode_app.sys, "stdin", stdin),
            mock.patch.object(zcode_app.termios, "tcgetattr", side_effect=get_attrs),
            mock.patch.object(zcode_app.pty, "fork", side_effect=fork),
            mock.patch.object(zcode_app.tty, "setraw"),
            mock.patch.object(zcode_app.termios, "tcsetattr"),
            mock.patch.object(zcode_app.select, "select", return_value=([9], [], [])),
            mock.patch.object(zcode_app.os, "read", return_value=b""),
            mock.patch.object(zcode_app.os, "waitpid", return_value=(123, 0)),
            mock.patch.object(zcode_app.os, "waitstatus_to_exitcode", return_value=0),
            mock.patch("sys.stdout", new_callable=io.StringIO),
        ):
            self.assertEqual(zcode_app.run_story(["dfrotz", "story.z5"]), 0)

        self.assertEqual(events[:2], ["tcgetattr", "fork"])

    def test_stdin_eof_sends_veof_and_is_removed_from_select(self):
        stdin = mock.Mock()
        stdin.fileno.return_value = 7
        stdin.isatty.return_value = True
        stdin_reads = iter([b"", b""])
        select_calls = []

        def select(readers, _write, _error):
            select_calls.append(list(readers))
            if len(select_calls) == 1:
                return ([stdin], [], [])
            return ([9], [], [])

        with (
            mock.patch.object(zcode_app.sys, "stdin", stdin),
            mock.patch.object(zcode_app.termios, "tcgetattr", return_value=[0]),
            mock.patch.object(zcode_app.pty, "fork", return_value=(123, 9)),
            mock.patch.object(zcode_app.tty, "setraw"),
            mock.patch.object(zcode_app.termios, "tcsetattr"),
            mock.patch.object(zcode_app.select, "select", side_effect=select),
            mock.patch.object(zcode_app.os, "read", side_effect=lambda _fd, _size: next(stdin_reads)),
            mock.patch.object(zcode_app.os, "write") as write,
            mock.patch.object(zcode_app.os, "waitpid", return_value=(123, 0)),
            mock.patch.object(zcode_app.os, "waitstatus_to_exitcode", return_value=0),
            mock.patch("sys.stdout", new_callable=io.StringIO),
        ):
            self.assertEqual(zcode_app.run_story(["dfrotz", "story.z5"]), 0)

        write.assert_called_once_with(9, b"\x04")
        self.assertIn(stdin, select_calls[0])
        self.assertNotIn(stdin, select_calls[1])


if __name__ == "__main__":
    unittest.main()
