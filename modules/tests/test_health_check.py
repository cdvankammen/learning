import os
import subprocess


def test_health_check_script_exists():
    script = '/usbip/repo/modules/monitor/health-check.sh'
    assert os.path.exists(script)


def test_health_check_runs_ok_or_reports():
    script = '/usbip/repo/modules/monitor/health-check.sh'
    log = '/usbip/session-files/health-check.log'
    # remove old log to ensure fresh output
    try:
        if os.path.exists(log):
            os.remove(log)
    except Exception:
        pass
    res = subprocess.run([script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    # give the script time to write its logfile
    import time
    time.sleep(0.2)
    out = res.stdout + res.stderr
    content = b''
    if os.path.exists(log):
        with open(log, 'rb') as f:
            content = f.read()
    # Pass if script exited 0 or the logfile contains OK
    assert res.returncode == 0 or b'OK' in content or b'OK' in out, (res.returncode, content.decode(errors='ignore'))
