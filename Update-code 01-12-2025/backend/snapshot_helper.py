#!/usr/bin/env python3
# snapshot_helper.py

import sys
import subprocess
from datetime import datetime, timedelta

def execute_command(command):
    """Execute shell command and return result"""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            executable='/bin/bash'
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return -1, "", str(e)

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: snapshot_helper.py <dataset> <snapshot_prefix> <retention_days>")
        sys.exit(1)

    dataset = sys.argv[1]
    snapshot_prefix = sys.argv[2]
    retention_days = int(sys.argv[3])
    
    # 1. Create snapshot
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    snapshot_name = f"{dataset}@{snapshot_prefix}-{timestamp}"
    
    create_rc, _, create_stderr = execute_command(f"sudo zfs snapshot {snapshot_name}")
    
    if create_rc != 0:
        # If creation fails, don't proceed with cleanup
        sys.exit(1)

    # 2. Cleanup old snapshots if retention is enabled
    if retention_days > 0:
        retention_limit = datetime.now() - timedelta(days=retention_days)

        # List snapshots for the dataset, sorted by creation time
        list_rc, list_stdout, _ = execute_command(f"sudo zfs list -t snapshot -o name,creation -s creation -r {dataset}")

        if list_rc == 0:
            for line in list_stdout.strip().split('\n'):
                if line and f"@{snapshot_prefix}-" in line:
                    snap_name = line.split('\t')[0]
                    # Use `date` command for robust parsing, similar to the new cron job logic
                    check_rc, _, _ = execute_command(f"if [ $(date -d \"$(zfs get -H -o value creation {snap_name})\" +%s) -lt $(date -d '{retention_days} days ago' +%s) ]; then exit 0; else exit 1; fi")
                    if check_rc == 0: # exit 0 means snapshot is old and should be deleted
                        execute_command(f"sudo zfs destroy {snap_name}")