import os
import subprocess


def test_restore_dry_run():
    script = '/usbip/repo/modules/lxc-restore/restore-or-replace.sh'
    assert os.path.exists(script)
    # dry-run should succeed and not modify state
    res = subprocess.run([script, '--dry-run'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert res.returncode == 0
    log = '/usbip/session-files/restore-or-replace.log'
    assert os.path.exists(log)
    with open(log, 'r') as f:
        content = f.read()
    assert 'Started at' in content or 'DRY-RUN' in content
