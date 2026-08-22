#!/usr/bin/env python3
# user_manager.py

import subprocess
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

class UserManager:
    def __init__(self):
        pass
    
    def execute_command(self, command: str) -> tuple:
        """Execute shell command and return result"""
        try:
            logger.info(f"User Manager - Running command: {command}")
            result = subprocess.run(
                command, 
                shell=True, 
                capture_output=True, 
                text=True, 
                executable='/bin/bash'
            )
            logger.info(f"User Manager - Command returncode: {result.returncode}")
            if result.stdout:
                logger.info(f"User Manager - Command stdout: {result.stdout}")
            if result.stderr:
                logger.info(f"User Manager - Command stderr: {result.stderr}")
            return result.returncode, result.stdout, result.stderr
        except Exception as e:
            logger.error(f"User Manager - Command exception: {e}")
            return -1, "", str(e)
    
    def create_system_user(self, username: str, full_name: str, password: str) -> Dict:
        """Create a system user account"""
        try:
            # Create user with home directory and full name
            returncode, stdout, stderr = self.execute_command(
                f'sudo useradd -m -c "{full_name}" {username}'
            )
            
            if returncode != 0:
                return {'success': False, 'message': f'Failed to create system user: {stderr}'}
            
            # Set password
            returncode, stdout, stderr = self.execute_command(
                f'echo "{username}:{password}" | sudo chpasswd'
            )
            
            if returncode != 0:
                # Clean up user if password setting fails
                self.execute_command(f'sudo userdel -r {username}')
                return {'success': False, 'message': f'Failed to set password: {stderr}'}
            
            logger.info(f"System user {username} created successfully")
            return {'success': True, 'message': f'System user {username} created successfully'}
            
        except Exception as e:
            logger.error(f"Error creating system user: {e}")
            return {'success': False, 'message': str(e)}
    
    def delete_system_user(self, username: str) -> Dict:
        """Delete a system user account"""
        try:
            returncode, stdout, stderr = self.execute_command(f'sudo userdel -r {username}')
            if returncode == 0:
                logger.info(f"System user {username} deleted successfully")
                return {'success': True, 'message': f'System user {username} deleted successfully'}
            else:
                return {'success': False, 'message': f'Failed to delete system user: {stderr}'}
        except Exception as e:
            logger.error(f"Error deleting system user: {e}")
            return {'success': False, 'message': str(e)}
    
    def create_system_group(self, group_name: str) -> Dict:
        """Create a system group"""
        try:
            returncode, stdout, stderr = self.execute_command(f'sudo groupadd {group_name}')
            if returncode == 0:
                logger.info(f"System group {group_name} created successfully")
                return {'success': True, 'message': f'System group {group_name} created successfully'}
            else:
                return {'success': False, 'message': f'Failed to create system group: {stderr}'}
        except Exception as e:
            logger.error(f"Error creating system group: {e}")
            return {'success': False, 'message': str(e)}
    
    def delete_system_group(self, group_name: str) -> Dict:
        """Delete a system group"""
        try:
            returncode, stdout, stderr = self.execute_command(f'sudo groupdel {group_name}')
            if returncode == 0:
                logger.info(f"System group {group_name} deleted successfully")
                return {'success': True, 'message': f'System group {group_name} deleted successfully'}
            else:
                return {'success': False, 'message': f'Failed to delete system group: {stderr}'}
        except Exception as e:
            logger.error(f"Error deleting system group: {e}")
            return {'success': False, 'message': str(e)}
    
    def add_user_to_group(self, username: str, group_name: str) -> Dict:
        """Add user to a system group"""
        try:
            returncode, stdout, stderr = self.execute_command(f'sudo usermod -a -G {group_name} {username}')
            if returncode == 0:
                logger.info(f"User {username} added to group {group_name} successfully")
                return {'success': True, 'message': f'User {username} added to group {group_name}'}
            else:
                return {'success': False, 'message': f'Failed to add user to group: {stderr}'}
        except Exception as e:
            logger.error(f"Error adding user to group: {e}")
            return {'success': False, 'message': str(e)}
    
    def remove_user_from_group(self, username: str, group_name: str) -> Dict:
        """Remove user from a system group"""
        try:
            # Get current groups for the user
            current_groups = self.get_user_groups(username)
            
            # Remove the target group from the list
            if group_name in current_groups:
                current_groups.remove(group_name)
                
                # Reconstruct the groups list without the target group
                # The primary group should remain the same
                primary_group = self.get_user_primary_group(username)
                
                # Filter out the primary group from secondary groups
                secondary_groups = [g for g in current_groups if g != primary_group]
                
                if secondary_groups:
                    # Set the new group list
                    groups_string = ','.join(secondary_groups)
                    returncode, stdout, stderr = self.execute_command(
                        f'sudo usermod -G {groups_string} {username}'
                    )
                else:
                    # If no secondary groups left, remove user from all secondary groups
                    returncode, stdout, stderr = self.execute_command(
                        f'sudo usermod -G "" {username}'
                    )
                
                if returncode == 0:
                    logger.info(f"User {username} removed from group {group_name} successfully")
                    return {'success': True, 'message': f'User {username} removed from group {group_name}'}
                else:
                    return {'success': False, 'message': f'Failed to remove user from group: {stderr}'}
            else:
                return {'success': False, 'message': f'User {username} is not in group {group_name}'}
                
        except Exception as e:
            logger.error(f"Error removing user from group: {e}")
            return {'success': False, 'message': str(e)}
    
    def get_user_primary_group(self, username: str) -> str:
        """Get the primary group for a user"""
        try:
            returncode, stdout, stderr = self.execute_command(f'id -gn {username}')
            if returncode == 0:
                return stdout.strip()
            return username  # Fallback to username as primary group
        except Exception:
            return username
    
    def get_system_users(self) -> List[Dict]:
        """Get all system users (UID >= 1000)"""
        try:
            returncode, stdout, stderr = self.execute_command('getent passwd')
            system_users = []
            
            if returncode == 0:
                for line in stdout.strip().split('\n'):
                    if line:
                        parts = line.split(':')
                        username = parts[0]
                        uid = int(parts[2])
                        full_name = parts[4] if parts[4] else username
                        
                        # Only include regular users (UID >= 1000)
                        if uid >= 1000:
                            # Get user groups
                            groups_result = self.execute_command(f'groups {username}')
                            groups = []
                            if groups_result[0] == 0 and groups_result[1]:
                                groups_line = groups_result[1].strip()
                                if ':' in groups_line:
                                    groups = groups_line.split(': ')[1].split(' ')
                            
                            system_users.append({
                                'username': username,
                                'uid': uid,
                                'full_name': full_name,
                                'groups': groups
                            })
            
            return system_users
            
        except Exception as e:
            logger.error(f"Error getting system users: {e}")
            return []
    
    def get_system_groups(self) -> List[Dict]:
        """Get all system groups (GID >= 1000) with proper filtering"""
        try:
            returncode, stdout, stderr = self.execute_command('getent group')
            system_groups = []
            
            if returncode == 0:
                for line in stdout.strip().split('\n'):
                    if line:
                        parts = line.split(':')
                        group_name = parts[0]
                        gid = int(parts[2])
                        members = parts[3].split(',') if parts[3] else []
                        
                        # System group names to exclude
                        system_group_names = [
                            'root', 'daemon', 'bin', 'sys', 'adm', 'tty', 'disk', 'lp', 'mail', 'news', 
                            'uucp', 'man', 'proxy', 'kmem', 'dialout', 'fax', 'voice', 'cdrom', 'floppy',
                            'tape', 'sudo', 'audio', 'dip', 'www-data', 'backup', 'operator', 'list',
                            'irc', 'src', 'gnats', 'shadow', 'utmp', 'video', 'sasl', 'plugdev', 'staff',
                            'games', 'users', 'nogroup', 'systemd-journal', 'systemd-timesync', 'systemd-network',
                            'systemd-resolve', 'systemd-bus-proxy', 'input', 'kvm', 'render', 'crontab',
                            'messagebus', 'avahi', 'netdev', 'ssh', 'utempter', 'rtkit', 'bluetooth',
                            'sambashare', 'mysql', 'iperf3', 'cockpit-ws', 'cockpit-wsinstance'
                        ]
                        
                        # Only include regular groups (GID >= 1000) and exclude system groups
                        if gid >= 1000 and group_name not in system_group_names:
                            system_groups.append({
                                'name': group_name,
                                'gid': gid,
                                'members': [m for m in members if m]  # Remove empty strings
                            })
            
            return system_groups
            
        except Exception as e:
            logger.error(f"Error getting system groups: {e}")
            return []
    
    def user_exists(self, username: str) -> bool:
        """Check if a system user exists"""
        try:
            returncode, stdout, stderr = self.execute_command(f'id {username}')
            return returncode == 0
        except Exception:
            return False
    
    def group_exists(self, group_name: str) -> bool:
        """Check if a system group exists"""
        try:
            returncode, stdout, stderr = self.execute_command(f'getent group {group_name}')
            return returncode == 0
        except Exception:
            return False
    
    def check_samba_user(self, username: str) -> bool:
        """Check if user has Samba account and it's ENABLED - FIXED IMPLEMENTATION"""
        try:
            # Use pdbedit to get detailed user info and check account flags
            returncode, stdout, stderr = self.execute_command(f'sudo pdbedit -L -v {username}')
            if returncode == 0 and stdout:
                # Look for account flags in the output
                # If account is disabled, it will show "Account Flags: [D" or similar
                if '[D' in stdout or 'Account Flags: [D' in stdout:
                    return False  # Account is disabled
                return True  # Account exists and is enabled
            return False
        except Exception as e:
            logger.error(f"Error checking Samba user {username}: {e}")
            # Fallback to simple check
            return self._check_samba_user_simple(username)
    
    def _check_samba_user_simple(self, username: str) -> bool:
        """Simple fallback check for Samba user"""
        try:
            returncode, stdout, stderr = self.execute_command(f'sudo pdbedit -L | grep ^{username}:')
            return returncode == 0
        except Exception:
            return False
    
    def get_user_groups(self, username: str) -> List[str]:
        """Get all groups for a specific user"""
        try:
            returncode, stdout, stderr = self.execute_command(f'groups {username}')
            if returncode == 0 and stdout:
                groups_line = stdout.strip()
                # Format is: "username : group1 group2 group3"
                if ':' in groups_line:
                    groups = groups_line.split(':')[1].strip().split(' ')
                    return groups
            return []
        except Exception:
            return []

    def update_user_password(self, username: str, new_password: str) -> Dict:
        """Update a system user's password"""
        try:
            returncode, stdout, stderr = self.execute_command(
                f'echo "{username}:{new_password}" | sudo chpasswd'
            )

            if returncode == 0:
                logger.info(f"Password updated successfully for user {username}")
                return {'success': True, 'message': f'Password updated successfully for user {username}'}
            else:
                return {'success': False, 'message': f'Failed to update password: {stderr}'}
        except Exception as e:
            logger.error(f"Error updating password for user {username}: {e}")
            return {'success': False, 'message': str(e)}

    def update_user_full_name(self, username: str, full_name: str) -> Dict:
        """Update a system user's full name"""
        try:
            returncode, stdout, stderr = self.execute_command(
                f'sudo usermod -c "{full_name}" {username}'
            )

            if returncode == 0:
                logger.info(f"Full name updated successfully for user {username}")
                return {'success': True, 'message': f'Full name updated successfully for user {username}'}
            else:
                return {'success': False, 'message': f'Failed to update full name: {stderr}'}
        except Exception as e:
            logger.error(f"Error updating full name for user {username}: {e}")
            return {'success': False, 'message': str(e)}

    def update_user_groups(self, username: str, groups: List[str]) -> Dict:
        """Update a system user's group memberships"""
        try:
            if groups:
                groups_string = ','.join(groups)
                returncode, stdout, stderr = self.execute_command(
                    f'sudo usermod -G {groups_string} {username}'
                )
            else:
                # Remove user from all secondary groups
                returncode, stdout, stderr = self.execute_command(
                    f'sudo usermod -G "" {username}'
                )

            if returncode == 0:
                logger.info(f"Groups updated successfully for user {username}")
                return {'success': True, 'message': f'Groups updated successfully for user {username}'}
            else:
                return {'success': False, 'message': f'Failed to update groups: {stderr}'}
        except Exception as e:
            logger.error(f"Error updating groups for user {username}: {e}")
            return {'success': False, 'message': str(e)}