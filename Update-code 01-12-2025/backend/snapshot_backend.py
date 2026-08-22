#!/usr/bin/env python3
# snapshot_backend.py

import logging
import subprocess
import os
from typing import Dict, List, Optional
from datetime import datetime
from zfs_manager import ZFSManager

logger = logging.getLogger(__name__)

class SnapshotBackend:
    def __init__(self):
        self.zfs_manager = ZFSManager()
    
    def create_snapshot(self, dataset: str, snapshot_name: str) -> Dict:
        """Create a ZFS snapshot"""
        if not dataset or not snapshot_name:
            return {
                'success': False,
                'message': "Dataset name and snapshot name are required"
            }
        
        # Validate dataset exists
        datasets = self.zfs_manager.list_datasets()
        dataset_exists = any(ds['name'] == dataset for ds in datasets)
        
        if not dataset_exists:
            return {
                'success': False,
                'message': f"Dataset '{dataset}' does not exist"
            }
        
        # Validate snapshot name format
        if not self._is_valid_snapshot_name(snapshot_name):
            return {
                'success': False,
                'message': "Invalid snapshot name. Use only alphanumeric characters, hyphens, and underscores"
            }
        
        return self.zfs_manager.create_snapshot(dataset, snapshot_name)
    
    def list_snapshots(self, dataset: str = None) -> List[Dict]:
        """List ZFS snapshots, optionally filtered by dataset"""
        if dataset:
            # For specific dataset, use zfs list directly
            returncode, stdout, stderr = self.zfs_manager.execute_command(f"sudo zfs list -o name,creation,used,refer -H -t snapshot {dataset}")
            snapshots = []
            if returncode == 0:
                for line in stdout.strip().split('\n'):
                    if line and '@' in line:
                        parts = line.split('\t')
                        snapshots.append({
                            'name': parts[0],
                            'creation': parts[1],
                            'used': parts[2],
                            'referenced': parts[3]
                        })
        else:
            # For all snapshots, use the manager method
            snapshots = self.zfs_manager.list_snapshots(dataset)

        # Add additional metadata while preserving the original name format
        for snapshot in snapshots:
            parts = snapshot['name'].split('@')
            snapshot['dataset'] = parts[0]  # Full dataset path
            snapshot['snapshot_name'] = parts[1] if len(parts) > 1 else ''  # Just the snapshot name
            snapshot['display_name'] = snapshot['name']  # Full snapshot path
            snapshot['short_name'] = parts[1] if len(parts) > 1 else snapshot['name']  # Just snapshot name for display

        return snapshots
    
    def delete_snapshot(self, snapshot_name: str) -> Dict:
        """Delete a ZFS snapshot"""
        if not snapshot_name:
            return {
                'success': False,
                'message': "Snapshot name is required"
            }
        
        # Validate snapshot exists
        snapshots = self.list_snapshots()
        snapshot_exists = any(snap['name'] == snapshot_name for snap in snapshots)
        
        if not snapshot_exists:
            return {
                'success': False,
                'message': f"Snapshot '{snapshot_name}' does not exist"
            }
        
        return self.zfs_manager.delete_snapshot(snapshot_name)
    
    def clone_snapshot(self, snapshot_name: str, clone_name: str) -> Dict:
        """Clone a ZFS snapshot to a new dataset"""
        if not snapshot_name or not clone_name:
            return {
                'success': False,
                'message': "Snapshot name and clone name are required"
            }
        
        # Extract dataset name from snapshot (e.g., "tank/dataset@snap" -> "tank/dataset")
        source_dataset = snapshot_name.split('@')[0]
        
        # Extract pool name from source dataset (e.g., "tank/dataset" -> "tank")
        pool_name = source_dataset.split('/')[0]
        
        # Generate full clone path (e.g., "tank/myclone")
        full_clone_name = f"{pool_name}/{clone_name}"
        
        # Validate clone name format
        if not self._is_valid_clone_name(clone_name):
            return {
                'success': False,
                'message': "Invalid clone name. Use only alphanumeric characters, hyphens, and underscores"
            }
        
        logger.info(f"Cloning snapshot {snapshot_name} to {full_clone_name}")
        
        return self.zfs_manager.clone_snapshot(snapshot_name, full_clone_name)
    
    def rollback_snapshot(self, snapshot_name: str) -> Dict:
        """Rollback a ZFS dataset to a snapshot"""
        if not snapshot_name:
            return {
                'success': False,
                'message': "Snapshot name is required"
            }
        
        # Validate snapshot exists
        snapshots = self.list_snapshots()
        snapshot_exists = any(snap['name'] == snapshot_name for snap in snapshots)
        
        if not snapshot_exists:
            return {
                'success': False,
                'message': f"Snapshot '{snapshot_name}' does not exist"
            }
        
        return self.zfs_manager.rollback_snapshot(snapshot_name)
    
    def get_snapshot_details(self, snapshot_name: str) -> Optional[Dict]:
        """Get detailed information about a specific snapshot"""
        snapshots = self.list_snapshots()
        for snapshot in snapshots:
            if snapshot['name'] == snapshot_name:
                return snapshot
        return None
    
    def get_available_pools(self) -> List[str]:
        """Get list of available pools for clone destination"""
        pools = self.zfs_manager.list_pools()
        return [pool['name'] for pool in pools]
    
    def _is_valid_snapshot_name(self, name: str) -> bool:
        """Validate snapshot name format"""
        import re
        # Allow alphanumeric, hyphens, underscores
        return bool(re.match(r'^[a-zA-Z0-9_\-]+$', name))
    
    def _is_valid_clone_name(self, name: str) -> bool:
        """Validate clone name format"""
        import re
        # Allow alphanumeric, hyphens, underscores (just the dataset name part)
        return bool(re.match(r'^[a-zA-Z0-9_\-]+$', name))
    
    def _setup_log_rotation(self) -> None:
        """Setup log rotation for the ZFS auto snapshots log file"""
        try:
            log_file = "/home/ubuntu/zfs-auto-snapshots.log"
            # For user home directory, we'll handle rotation manually in the cron job
            # Ensure log file exists and has correct permissions
            if not os.path.exists(log_file):
                try:
                    with open(log_file, 'w') as f:
                        f.write("# ZFS Auto Snapshots Log\n")
                    os.chmod(log_file, 0o644)
                except PermissionError:
                    # If we can't create the log file, continue anyway
                    # The cron job will still work, just without logging
                    pass

        except Exception as e:
            logger.warning(f"Failed to setup log rotation: {str(e)}")

    def _is_valid_dataset_name(self, name: str) -> bool:
        """Validate dataset name format"""
        import re
        # Should be in format pool/dataset
        return bool(re.match(r'^[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-]+$', name))

    def schedule_snapshot(self, dataset: str, snapshot_name: str, schedule_type: str,
                          hour: str = '0', minute: str = '0', day_of_week: str = '*',
                          day_of_month: str = '*', month: str = '*', retention_days: int = 7) -> Dict:
        """Schedule a ZFS snapshot using crontab"""
        if not dataset or not snapshot_name:
            return {
                'success': False,
                'message': "Dataset name and snapshot name are required"
            }

        # Validate dataset exists
        datasets = self.zfs_manager.list_datasets()
        dataset_exists = any(ds['name'] == dataset for ds in datasets)

        if not dataset_exists:
            return {
                'success': False,
                'message': f"Dataset '{dataset}' does not exist"
            }

        # Validate snapshot name format
        if not self._is_valid_snapshot_name(snapshot_name):
            return {
                'success': False,
                'message': "Invalid snapshot name. Use only alphanumeric characters, hyphens, and underscores"
            }

        # Generate crontab entry based on schedule type
        cron_expression = self._generate_cron_expression(schedule_type, minute, hour, day_of_month, month, day_of_week)

        # Path to the new helper script
        helper_script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snapshot_helper.py')
        log_file = "/home/ubuntu/zfs-auto-snapshots.log"

        # Create a self-contained command for snapshot creation and cleanup.
        # This is more robust than relying on Python date parsing in a helper script.
        timestamp_format = "$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S)"
        create_cmd = f"sudo zfs snapshot {dataset}@{snapshot_name}-{timestamp_format}"
        
        cleanup_cmd = ""
        if retention_days > 0:
            # Use a more robust shell arithmetic method for age calculation, as requested.
            # This avoids potential issues with `date -d 'X days ago'`.
            retention_seconds = retention_days * 24 * 60 * 60
            cleanup_cmd = (f" && sudo zfs list -t snapshot -o name,creation -s creation {dataset} | grep '@{snapshot_name}-' | "
                           f"while read snap creation; do age_seconds=$(( $(date +\\%s) - $(date -d\"$creation\" +\\%s) )); if [ \"$age_seconds\" -gt \"{retention_seconds}\" ]; then sudo zfs destroy \"$snap\"; fi; done")
        # Final robust command format.
        # We construct the command directly and escape '%' for cron. This avoids nested shell quoting issues.
        command = f"{create_cmd}{cleanup_cmd} >> {log_file} 2>&1"

        # Create crontab entry
        retention_display = "off" if retention_days == 0 else f"{retention_days} days"
        cron_comment = f"# ZFS Snapshot: {dataset}@{snapshot_name} (retention: {retention_display})"
        cron_job = f"{cron_expression} {command}"

        # Also add log rotation setup if not already present (don't fail if we can't set it up)
        try:
            self._setup_log_rotation()
        except:
            pass

        try:
            # Add to crontab
            result = self._add_to_crontab(cron_comment, cron_job)
            if result['success']:
                logger.info(f"Scheduled snapshot for {dataset} with cron expression: {cron_expression}")
                return {
                    'success': True,
                    'message': f"Snapshot scheduled successfully for {dataset}"
                }
            else:
                return result
        except Exception as e:
            logger.error(f"Failed to schedule snapshot: {str(e)}")
            return {
                'success': False,
                'message': f"Failed to schedule snapshot: {str(e)}"
            }

    def _generate_cron_expression(self, schedule_type: str, minute: str, hour: str,
                                day_of_month: str, month: str, day_of_week: str) -> str:
        """Generate cron expression based on schedule type"""
        if schedule_type == 'hourly':
            return f"0 * * * *"
        elif schedule_type == 'daily':
            return f"{minute} {hour} * * *"
        elif schedule_type == 'weekly':
            return f"{minute} {hour} * * {day_of_week}"
        elif schedule_type == 'monthly':
            return f"{minute} {hour} {day_of_month} * *"
        elif schedule_type == 'custom':
            # For custom schedules, use the provided values directly
            return f"{minute} {hour} {day_of_month} {month} {day_of_week}"
        else:
            # Default to daily
            return f"{minute} {hour} * * *"

    def _add_to_crontab(self, comment: str, cron_job: str) -> Dict:
        """Add a cron job to the user crontab"""
        try:
            # Get current user crontab
            result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)

            current_crontab = ""
            if result.returncode == 0:
                current_crontab = result.stdout
            elif "no crontab" in result.stderr.lower():
                # No existing crontab, that's fine
                pass
            else:
                return {
                    'success': False,
                    'message': f"Failed to read crontab: {result.stderr}"
                }

            # Check if this exact job already exists
            if cron_job in current_crontab:
                return {
                    'success': False,
                    'message': "This snapshot schedule already exists"
                }

            # Add the new cron job
            new_crontab = current_crontab.rstrip() + '\n\n' + comment + '\n' + cron_job + '\n'

            # Write back to user crontab
            process = subprocess.run(['crontab', '-'], input=new_crontab, text=True, capture_output=True)

            if process.returncode == 0:
                return {
                    'success': True,
                    'message': "Cron job added successfully"
                }
            else:
                return {
                    'success': False,
                    'message': f"Failed to update user crontab: {process.stderr}"
                }

        except Exception as e:
            return {
                'success': False,
                'message': f"Error managing user crontab: {str(e)}"
            }

    def list_scheduled_snapshots(self) -> List[Dict]:
        """List all scheduled ZFS snapshots from user crontab"""
        try:
            result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)

            if result.returncode != 0 and "no crontab" not in result.stderr.lower():
                return []

            crontab_content = result.stdout
            scheduled_snapshots = []
            lines = crontab_content.split('\n')

            i = 0
            while i < len(lines):
                line = lines[i].strip()
                if line.startswith('# ZFS Snapshot:'):
                    # Extract dataset and snapshot name from comment
                    comment_parts = line.replace('# ZFS Snapshot:', '').strip().split('@')
                    if len(comment_parts) == 2:
                        dataset = comment_parts[0].strip()
                        snapshot_name_with_retention = comment_parts[1].strip()
                        # Extract just the snapshot name (remove retention info)
                        snapshot_name = snapshot_name_with_retention.split(' ')[0]

                        # Find the next non-comment line (the cron job)
                        cron_line = ""
                        j = i + 1
                        while j < len(lines) and not cron_line:
                            next_line = lines[j].strip()
                            if next_line and not next_line.startswith('#'):
                                cron_line = next_line
                                break
                            j += 1

                        if cron_line:
                            # Parse cron expression to get schedule info
                            cron_parts = cron_line.split()
                            if len(cron_parts) >= 6:
                                minute, hour, day_of_month, month, day_of_week = cron_parts[:5]
                                command = ' '.join(cron_parts[5:])

                                # Calculate next run time and last run time
                                next_run, last_run = self._calculate_schedule_times(minute, hour, day_of_month, month, day_of_week, dataset, snapshot_name)

                                # Extract retention days from comment if available
                                retention_days = 7  # default
                                if '(retention:' in line:
                                    try:
                                        retention_part = line.split('(retention:')[1].split('days)')[0].strip()
                                        if retention_part.lower() == 'off':
                                            retention_days = 0
                                        else:
                                            retention_days = int(retention_part)
                                    except:
                                        retention_days = 7

                                scheduled_snapshots.append({
                                    'dataset': dataset,
                                    'snapshot_name': snapshot_name,
                                    'cron_comment': line,
                                    'cron_expression': f"{minute} {hour} {day_of_month} {month} {day_of_week}",
                                    'command': command,
                                    'next_run': next_run,
                                    'last_run': last_run,
                                    'retention_days': retention_days
                                })
                i += 1

            return scheduled_snapshots

        except Exception as e:
            logger.error(f"Failed to list scheduled snapshots: {str(e)}")
            return []

    def remove_scheduled_snapshot(self, dataset: str, snapshot_name: str) -> Dict:
        """Remove a scheduled snapshot from user crontab"""
        try:
            result = subprocess.run(['crontab', '-l'], capture_output=True, text=True)

            if result.returncode != 0:
                return {
                    'success': False,
                    'message': "No crontab found"
                }

            crontab_lines = result.stdout.split('\n')
            new_crontab_lines = []
            skip_next = False
            removed = False

            i = 0
            while i < len(crontab_lines):
                line = crontab_lines[i].strip()

                # Check if this is the snapshot we want to remove
                if line.startswith(f"# ZFS Snapshot: {dataset}@{snapshot_name}"):
                    # Skip this comment and the next non-comment line
                    skip_next = True
                    removed = True
                    i += 1  # Skip the comment line
                    continue
                elif skip_next and not line.startswith('#') and line.strip():
                    # Skip the cron job line
                    skip_next = False
                    i += 1
                    continue
                elif skip_next and line.startswith('#'):
                    # If next line is another comment, keep skipping until we find the cron job
                    i += 1
                    continue
                else:
                    skip_next = False
                    new_crontab_lines.append(crontab_lines[i])
                    i += 1

            if not removed:
                return {
                    'success': False,
                    'message': f"Scheduled snapshot {dataset}@{snapshot_name} not found"
                }

            # Write back the updated crontab
            new_crontab = '\n'.join(new_crontab_lines) + '\n'
            process = subprocess.run(['crontab', '-'], input=new_crontab, text=True, capture_output=True)

            if process.returncode == 0:
                return {
                    'success': True,
                    'message': f"Scheduled snapshot {dataset}@{snapshot_name} removed successfully"
                }
            else:
                return {
                    'success': False,
                    'message': f"Failed to update crontab: {process.stderr}"
                }

        except Exception as e:
            return {
                'success': False,
                'message': f"Error removing scheduled snapshot: {str(e)}"
            }

    def _calculate_schedule_times(self, minute: str, hour: str, day_of_month: str, month: str, day_of_week: str, dataset: str, snapshot_name: str) -> tuple:
        """Calculate next run time and last run time for a cron schedule"""
        from datetime import datetime, timedelta
        import calendar

        now = datetime.now()

        try:
            # Use a more robust cron calculation approach
            next_run = self._calculate_next_cron_run(minute, hour, day_of_month, month, day_of_week, now)

            if next_run:
                next_run_str = next_run.strftime("%Y-%m-%d %H:%M")
            else:
                next_run_str = "Unknown"

            # Try to find the last run by looking for recent snapshots with the pattern
            last_run = self._find_last_snapshot_run(dataset, snapshot_name)

            return next_run_str, last_run

        except (ValueError, AttributeError):
            return "Unknown", "Unknown"

    def _calculate_next_cron_run(self, minute: str, hour: str, day_of_month: str, month: str, day_of_week: str, now: datetime) -> datetime:
        """Calculate the next run time for a cron expression"""
        from datetime import datetime, timedelta
        import calendar

        # Start with current time + 1 minute to avoid scheduling in the past
        current = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

        # Try for a reasonable number of iterations (next 365 days)
        for _ in range(365 * 24 * 60):  # Check every minute for a year
            if self._matches_cron(current, minute, hour, day_of_month, month, day_of_week):
                return current
            current += timedelta(minutes=1)

        return None

    def _matches_cron(self, dt: datetime, minute: str, hour: str, day_of_month: str, month: str, day_of_week: str) -> bool:
        """Check if a datetime matches the cron expression"""
        try:
            # Handle asterisk (any value)
            if minute != '*' and not self._matches_cron_field(minute, dt.minute):
                return False
            if hour != '*' and not self._matches_cron_field(hour, dt.hour):
                return False
            if day_of_month != '*' and not self._matches_cron_field(day_of_month, dt.day):
                return False
            if month != '*' and not self._matches_cron_field(month, dt.month):
                return False
            if day_of_week != '*' and not self._matches_cron_field(day_of_week, dt.weekday()):
                return False

            return True
        except (ValueError, TypeError):
            return False

    def _matches_cron_field(self, field: str, value: int) -> bool:
        """Check if a value matches a cron field expression"""
        # A more robust cron field matching logic that handles lists, ranges, and steps.
        if field == '*':
            return True
        
        for part in field.split(','):
            step = 1
            range_spec = part
            if '/' in part:
                range_spec, step_str = part.split('/')
                try:
                    step = int(step_str)
                except ValueError:
                    return False # Invalid step value

            if range_spec == '*':
                if value % step == 0:
                    return True
            elif '-' in range_spec:
                start, end = map(int, range_spec.split('-'))
                if value >= start and value <= end and (value - start) % step == 0:
                    return True
            elif int(range_spec) == value:
                return True
        return False

    def _find_last_snapshot_run(self, dataset: str, snapshot_name: str) -> str:
        """Find the last time this scheduled snapshot ran by checking the log file first, then snapshots"""
        try:
            # First try to find from log file
            log_file = "/home/ubuntu/zfs-auto-snapshots.log"
            log_content = self.zfs_manager.execute_command(f"cat {log_file} 2>/dev/null || true")
            if log_content[0] == 0 and log_content[1].strip():
                lines = log_content[1].strip().split('\n')
                matching_times = []
                for line in lines:
                    if line and not line.startswith('#'):
                        try:
                            parts = line.split(' - ', 1)
                            if len(parts) == 2:
                                timestamp_str = parts[0]
                                message = parts[1]
                                # Check if this log entry is for our snapshot
                                if f"Created {dataset}@{snapshot_name}" in message:
                                    dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                                    matching_times.append(dt)
                        except (ValueError, IndexError):
                            continue

                if matching_times:
                    # Sort by time (most recent first)
                    matching_times.sort(reverse=True)
                    most_recent = matching_times[0]
                    # Format as YYYY-MM-DD HH:MM (without seconds to match UI format)
                    return most_recent.strftime("%Y-%m-%d %H:%M")

            # If no log entries found, fall back to snapshot name parsing
            all_snapshots = self.list_snapshots(dataset)

            # Look for snapshots that match our naming pattern
            matching_snapshots = []
            for snap in all_snapshots:
                snap_name = snap['name'].split('@')[1] if '@' in snap['name'] else snap['name']
                # Check if it starts with our snapshot name and has a timestamp
                if snap_name.startswith(snapshot_name + '-') and len(snap_name) > len(snapshot_name) + 1:
                    try:
                        # Extract timestamp part (format: YYYYMMDD_HHMMSS)
                        timestamp_part = snap_name[len(snapshot_name) + 1:]
                        if len(timestamp_part) == 15 and timestamp_part[8] == '_':
                            # Parse the timestamp
                            dt = datetime.strptime(timestamp_part, "%Y%m%d_%H%M%S")
                            matching_snapshots.append((snap, dt))
                    except (ValueError, IndexError):
                        continue

            if matching_snapshots:
                # Sort by creation time (most recent first)
                matching_snapshots.sort(key=lambda x: x[1], reverse=True)
                most_recent = matching_snapshots[0][1]
                # Format as YYYY-MM-DD HH:MM (without seconds to match UI format)
                return most_recent.strftime("%Y-%m-%d %H:%M")

            return "Never"
        except Exception as e:
            logger.error(f"Error finding last snapshot run for {dataset}@{snapshot_name}: {str(e)}")
            return "Unknown"

    def get_snapshot_logs(self, dataset: str, snapshot_name: str, limit: int = 20) -> List[Dict]:
        """Get logs for a specific scheduled snapshot"""
        try:
            logs = []

            # Read from the dedicated log file first
            log_file = "/home/ubuntu/zfs-auto-snapshots.log"
            log_content = self.zfs_manager.execute_command(f"cat {log_file} 2>/dev/null || true")
            if log_content[0] == 0 and log_content[1].strip():
                lines = log_content[1].strip().split('\n')
                for line in lines:
                    if line and not line.startswith('#'):
                        try:
                            # Parse format: YYYY-MM-DD HH:MM:SS - message
                            parts = line.split(' - ', 1)
                            if len(parts) == 2:
                                timestamp_str = parts[0]
                                message = parts[1]

                                # Check if this message is related to our snapshot
                                is_relevant = (
                                    f"{dataset}@{snapshot_name}" in message or
                                    (snapshot_name in message and ('Created' in message or 'Deleted' in message))
                                )

                                if is_relevant:
                                    # Convert to ISO format for consistency
                                    try:
                                        dt = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                                        timestamp = dt.isoformat()
                                    except:
                                        timestamp = timestamp_str

                                    # Determine log level based on message content
                                    level = 'info'
                                    if 'Created' in message and 'snapshot' in message:
                                        level = 'info'
                                    elif 'Deleted' in message or 'Deleting' in message:
                                        level = 'warning'
                                    elif 'error' in message.lower() or 'failed' in message.lower():
                                        level = 'error'

                                    logs.append({
                                        'timestamp': timestamp,
                                        'message': message,
                                        'level': level
                                    })
                        except (ValueError, IndexError):
                            continue

            # Get cron logs which show command execution
            cron_logs = self.zfs_manager.execute_command("journalctl -u cron --no-pager -n 1000 --output=short-iso")
            if cron_logs[0] == 0:
                lines = cron_logs[1].strip().split('\n')
                for line in lines:
                    if line and f"zfs snapshot {dataset}@{snapshot_name}" in line:
                        try:
                            parts = line.split(' ', 3)
                            if len(parts) >= 4:
                                timestamp = parts[0]
                                message = parts[3]

                                # Skip CMD lines as they show the command being executed, not results
                                if "(ubuntu) CMD" in message:
                                    continue

                                # Determine log level based on message content
                                level = 'info'
                                if 'exit code' in message.lower() or 'failed' in message.lower():
                                    level = 'error'
                                elif 'error' in message.lower():
                                    level = 'error'

                                logs.append({
                                    'timestamp': timestamp,
                                    'message': message,
                                    'level': level
                                })
                        except (ValueError, IndexError):
                            continue

            # Try to execute a test command to check for potential ZFS errors
            # Use the same format as the actual cron job command
            test_command = f"sudo zfs snapshot {dataset}@{snapshot_name}-test-$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S) 2>&1"
            test_result = self.zfs_manager.execute_command(test_command)
            if test_result[0] != 0 and test_result[1]:  # If command failed
                error_message = test_result[1].strip()
                # Add the error message regardless of content - ZFS errors will be in stderr
                logs.append({
                    'timestamp': datetime.now().isoformat(),
                    'message': f"ZFS Error: {error_message}",
                    'level': 'error'
                })

            # Clean up the test snapshot if it was created (use a pattern to match the timestamped name)
            cleanup_test = self.zfs_manager.execute_command(f"sudo zfs list -t snapshot -o name {dataset} | grep '{snapshot_name}-test-' | head -5 | xargs -I {{}} sudo zfs destroy {{}} 2>/dev/null || true")

            # Get all system logs and look for ZFS errors
            system_logs = self.zfs_manager.execute_command("journalctl --no-pager -n 2000 --output=short-iso --since '6 hours ago'")
            if system_logs[0] == 0:
                lines = system_logs[1].strip().split('\n')
                for line in lines:
                    if line and ('zfs' in line.lower() or 'cannot create' in line or 'out of space' in line or 'permission denied' in line):
                        try:
                            parts = line.split(' ', 2)
                            if len(parts) >= 3:
                                timestamp = parts[0]
                                hostname = parts[1]
                                message = ' '.join(parts[2:]) if len(parts) > 2 else parts[2]

                                # Check if this message is related to our snapshot
                                is_relevant = (
                                    f"{dataset}@{snapshot_name}" in message or
                                    snapshot_name in message or
                                    ('cannot create' in message and 'snapshot' in message) or
                                    ('out of space' in message and 'snapshot' in message) or
                                    ('permission denied' in message and 'snapshot' in message) or
                                    ('cannot create' in message and 'zfs' in message)
                                )

                                if is_relevant:
                                    # Determine if this is an error
                                    level = 'error' if any(err in message.lower() for err in [
                                        'cannot create', 'out of space', 'permission denied',
                                        'dataset does not exist', 'no such file', 'failed',
                                        'error', 'exit code', 'does not exist'
                                    ]) else 'info'

                                    # Check for duplicates and add to logs
                                    if not any(log['message'] == message for log in logs):
                                        logs.append({
                                            'timestamp': timestamp,
                                            'message': message,
                                            'level': level
                                        })
                        except (ValueError, IndexError):
                            continue

            # Check /var/log/syslog for ZFS errors
            syslog_file = self.zfs_manager.execute_command("tail -n 500 /var/log/syslog 2>/dev/null | grep -E 'zfs|cannot create|out of space|permission denied' || true")
            if syslog_file[0] == 0 and syslog_file[1].strip():
                lines = syslog_file[1].strip().split('\n')
                for line in lines:
                    if line and (snapshot_name in line or 'cannot create' in line or 'out of space' in line or 'permission denied' in line):
                        try:
                            # Parse syslog format: Month Day Time hostname process[pid]: message
                            parts = line.split(' ', 5)
                            if len(parts) >= 6:
                                month = parts[0]
                                day = parts[1]
                                time = parts[2]
                                hostname = parts[3]
                                process_info = parts[4]
                                message = parts[5]

                                # Check if this message is related to our snapshot
                                is_relevant = (
                                    f"{dataset}@{snapshot_name}" in message or
                                    snapshot_name in message or
                                    ('cannot create' in message and 'snapshot' in message) or
                                    ('out of space' in message and 'snapshot' in message) or
                                    ('permission denied' in message and 'snapshot' in message) or
                                    ('cannot create' in message and 'zfs' in message)
                                )

                                if is_relevant:
                                    # Create timestamp from current year + month/day/time
                                    current_year = datetime.now().year
                                    timestamp_str = f"{current_year} {month} {day} {time}"
                                    try:
                                        timestamp_obj = datetime.strptime(timestamp_str, "%Y %b %d %H:%M:%S")
                                        timestamp = timestamp_obj.isoformat()
                                    except:
                                        timestamp = datetime.now().isoformat()

                                    level = 'error' if any(err in message.lower() for err in [
                                        'cannot create', 'out of space', 'permission denied',
                                        'dataset does not exist', 'failed'
                                    ]) else 'info'

                                    if not any(log['message'] == message for log in logs):
                                        logs.append({
                                            'timestamp': timestamp,
                                            'message': message,
                                            'level': level
                                        })
                        except (ValueError, IndexError):
                            continue

            # Sort logs by timestamp (most recent first)
            logs.sort(key=lambda x: x['timestamp'], reverse=True)

            # Also check for recent snapshots that failed to create
            try:
                recent_snapshots = self.list_snapshots(dataset)
                expected_pattern = f"{dataset}@{snapshot_name}-"
                found_recent = False

                for snap in recent_snapshots[:10]:  # Check last 10 snapshots
                    if snap['name'].startswith(expected_pattern):
                        found_recent = True
                        break

                if not found_recent and logs:  # If no recent snapshots but we have logs, might indicate failure
                    logs.insert(0, {
                        'timestamp': datetime.now().isoformat(),
                        'message': f"Scheduled snapshot {dataset}@{snapshot_name} may have failed - no recent snapshots found",
                        'level': 'warning'
                    })
            except Exception:
                pass

            return logs[-limit:] if logs else []
        except Exception as e:
            logger.error(f"Error getting snapshot logs for {dataset}@{snapshot_name}: {str(e)}")
            return []

    def _is_valid_dataset_name(self, name: str) -> bool:
        """Validate dataset name format"""
        import re
        # Should be in format pool/dataset
        return bool(re.match(r'^[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-]+$', name))