import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / 'modules' / 'backup' / 'prune-backups.sh'
LOG = Path('/usbip/session-files/prune-backups.log')


def test_prune_dry_run():
    assert SCRIPT.exists()
    # remove previous log if present
    try:
        if LOG.exists():
            LOG.unlink()
    except Exception:
        pass
    res = subprocess.run([str(SCRIPT), '--dry-run'], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert res.returncode == 0
    assert LOG.exists()
    with LOG.open('r') as f:
        content = f.read()
    assert 'Prune run completed' in content or 'DRY-RUN' in content
