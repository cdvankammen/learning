import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / 'modules' / 'monitor' / 'health-check.sh'
LOG = Path('/usbip/session-files/health-check.log')


def test_health_check_script_exists():
    assert SCRIPT.exists()


def test_health_check_runs_ok_or_reports():
    # remove old log to ensure fresh output
    try:
        if LOG.exists():
            LOG.unlink()
    except Exception:
        pass
    res = subprocess.run([str(SCRIPT)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    # give the script time to write its logfile
    import time
    time.sleep(0.2)
    out = res.stdout + res.stderr
    content = b''
    if LOG.exists():
        content = LOG.read_bytes()
    # Pass if script exited 0 or the logfile contains OK
    assert res.returncode == 0 or b'OK' in content or b'OK' in out, (res.returncode, content.decode(errors='ignore'))
