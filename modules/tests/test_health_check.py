import os
import subprocess


def test_health_check_script_exists():
    script = '/usbip/repo/modules/monitor/health-check.sh'
    assert os.path.exists(script)


def test_health_check_runs_ok_or_reports():
    script = '/usbip/repo/modules/monitor/health-check.sh'
    res = subprocess.run([script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out = res.stdout + res.stderr
    # Pass if script exited 0 or printed OK; otherwise surface output for diagnosis
    assert res.returncode == 0 or b'OK' in out, out.decode()
