import os
import subprocess


def test_prune_dry_run():
    script = '/usbip/repo/modules/backup/prune-backups.sh'
    assert os.path.exists(script)
    log = '/usbip/session-files/prune-backups.log'
    # remove previous log if present
    try:
        if os.path.exists(log):
            os.remove(log)
    except Exception:
        pass
    res = subprocess.run([script, '--dry-run'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert res.returncode == 0
    assert os.path.exists(log)
    with open(log, 'r') as f:
        content = f.read()
    assert 'Prune run completed' in content or 'DRY-RUN' in content
