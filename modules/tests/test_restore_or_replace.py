import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / 'modules' / 'lxc-restore' / 'restore-or-replace.sh'
LOG = Path('/usbip/session-files/restore-or-replace.log')


def test_restore_dry_run():
    assert SCRIPT.exists()
    # dry-run should succeed and not modify state
    res = subprocess.run([str(SCRIPT), '--dry-run'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert res.returncode == 0
    assert LOG.exists()
    with LOG.open('r') as f:
        content = f.read()
    assert 'Started at' in content or 'DRY-RUN' in content
