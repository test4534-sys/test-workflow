#!/usr/bin/env python3
# samba_manager.py - Combined Samba service and configuration management

import subprocess
import os
import logging
import re
import tempfile
import shutil
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

class SambaManager:
    def __init__(self, config_file: str = '/etc/samba/smb.conf'):
        self.config_file = config_file
        self.backup_file = '/etc/samba/smb.conf.backup'
        self.audit_log_file = '/var/log/samba-audit.log'
        self.rsyslog_config_file = '/etc/rsyslog.d/samba-audit.conf'
    
    def execute_command(self, command: str, use_sudo: bool = True, input_text: str = None) -> tuple:
        """Execute shell command and return result"""
        try:
            if use_sudo:
                command = f"sudo {command}"
            logger.info(f"Samba Manager - Running command: {command}")
            
            if input_text:
                result = subprocess.run(
                    command, 
                    shell=True, 
                    capture_output=True, 
                    text=True, 
                    executable='/bin/bash',
                    input=input_text
                )
            else:
                result = subprocess.run(
                    command, 
                    shell=True, 
                    capture_output=True, 
                    text=True, 
                    executable='/bin/bash'
                )
            
            logger.info(f"Samba Manager - Command returncode: {result.returncode}")
            if result.stdout:
                logger.info(f"Samba Manager - Command stdout: {result.stdout}")
            if result.stderr:
                logger.info(f"Samba Manager - Command stderr: {result.stderr}")
            return result.returncode, result.stdout, result.stderr
        except Exception as e:
            logger.error(f"Samba Manager - Command exception: {e}")
            return -1, "", str(e)
    
    def get_samba_service_status(self) -> Dict:
        """Get Samba service status - FIXED with proper service detection"""
        try:
            services = {}
            
            # Check smbd status with detailed information
            returncode, stdout, stderr = self.execute_command('systemctl is-active smbd', use_sudo=False)
            smbd_simple = stdout.strip() if returncode == 0 else 'inactive'
            services['smbd_simple'] = smbd_simple
            
            # Get detailed status for smbd
            returncode, stdout, stderr = self.execute_command('systemctl show smbd --property=ActiveState,SubState --no-pager', use_sudo=False)
            if returncode == 0:
                if 'ActiveState=active' in stdout and 'SubState=running' in stdout:
                    services['smbd'] = 'running'
                else:
                    services['smbd'] = 'stopped'
            else:
                services['smbd'] = 'unknown'
            
            # Check nmbd status with detailed information
            returncode, stdout, stderr = self.execute_command('systemctl is-active nmbd', use_sudo=False)
            nmbd_simple = stdout.strip() if returncode == 0 else 'inactive'
            services['nmbd_simple'] = nmbd_simple
            
            # Get detailed status for nmbd
            returncode, stdout, stderr = self.execute_command('systemctl show nmbd --property=ActiveState,SubState --no-pager', use_sudo=False)
            if returncode == 0:
                if 'ActiveState=active' in stdout and 'SubState=running' in stdout:
                    services['nmbd'] = 'running'
                else:
                    services['nmbd'] = 'stopped'
            else:
                services['nmbd'] = 'unknown'
            
            # Overall Samba service status
            if (services.get('smbd') == 'running' and 
                services.get('nmbd') == 'running'):
                services['overall'] = 'running'
            else:
                services['overall'] = 'stopped'
            
            return {'success': True, 'services': services}
            
        except Exception as e:
            logger.error(f"Error getting Samba service status: {e}")
            return {'success': False, 'message': str(e)}
    
    # Configuration management methods
    def read_config(self) -> Dict:
        """Read and parse current Samba configuration from file"""
        try:
            # First try to read without sudo (if file permissions allow)
            try:
                with open(self.config_file, 'r') as f:
                    content = f.read()
                return self._parse_config(content)
            except (PermissionError, FileNotFoundError):
                # If permission denied, try with sudo
                returncode, stdout, stderr = self.execute_command(f'cat {self.config_file}')
                
                if returncode != 0:
                    # File might not exist, return empty config
                    logger.warning(f"Could not read Samba config file: {stderr}")
                    return {'global': {}, 'shares': {}}
                
                return self._parse_config(stdout)
        except Exception as e:
            logger.error(f"Error reading Samba config: {e}")
            return {'global': {}, 'shares': {}}
    
    def _parse_config(self, content: str) -> Dict:
        """Parse Samba configuration content"""
        config = {'global': {}, 'shares': {}}
        current_section = None
        
        for line in content.split('\n'):
            line = line.strip()
            
            # Skip comments and empty lines
            if not line or line.startswith('#') or line.startswith(';'):
                continue
            
            # Section header
            if line.startswith('[') and line.endswith(']'):
                section_name = line[1:-1].strip()
                if section_name.lower() == 'global':
                    current_section = 'global'
                else:
                    current_section = section_name
                    config['shares'][section_name] = {}
                continue
            
            # Key-value pairs
            if '=' in line and current_section:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                
                if current_section == 'global':
                    config['global'][key] = value
                else:
                    config['shares'][current_section][key] = value
        
        return config
    
    def write_config(self, config: Dict) -> bool:
        """Write Samba configuration to file"""
        try:
            # Generate config content
            content = self._generate_config(config)
            
            # Write to temporary file first
            with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
                temp_file.write(content)
                temp_path = temp_file.name
            
            # Create backup of current config if it exists
            returncode, stdout, stderr = self.execute_command(f'test -f {self.config_file}', use_sudo=False)
            if returncode == 0:
                # Backup existing config
                backup_result = self.execute_command(f'cp {self.config_file} {self.backup_file}')
                if backup_result[0] != 0:
                    logger.warning(f"Failed to create backup: {backup_result[2]}")
            
            # Copy temporary file to actual location with sudo
            copy_result = self.execute_command(f'cp {temp_path} {self.config_file}')
            
            # Clean up temporary file
            os.unlink(temp_path)
            
            if copy_result[0] != 0:
                logger.error(f"Failed to copy config to {self.config_file}: {copy_result[2]}")
                return False
            
            # Set proper permissions
            self.execute_command(f'chmod 644 {self.config_file}')
            
            logger.info("Samba configuration written successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error writing Samba config: {e}")
            # Clean up temporary file if it exists
            try:
                if 'temp_path' in locals():
                    os.unlink(temp_path)
            except:
                pass
            return False
    
    def _generate_config(self, config: Dict) -> str:
        """Generate Samba configuration content"""
        lines = []
        
        # Global section with default values
        global_config = config.get('global', {})
        lines.append('[global]')
        lines.append('    workgroup = ' + global_config.get('workgroup', 'WORKGROUP'))
        lines.append('    server string = ' + global_config.get('server string', 'ZFS Storage Server'))
        lines.append('    netbios name = ' + global_config.get('netbios name', 'ZFS-SERVER'))
        lines.append('    security = user')
        lines.append('    map to guest = bad user')
        lines.append('    dns proxy = no')
        lines.append('    log file = /var/log/samba/log.%m')
        lines.append('    max log size = 1000')
        lines.append('    syslog = 0')
        lines.append('    panic action = /usr/share/samba/panic-action %d')
        
        # Add audit settings if any share has audit enabled
        has_audit_shares = any('vfs objects' in share_config and 'full_audit' in share_config.get('vfs objects', '')
                              for share_config in config.get('shares', {}).values())
        
        if has_audit_shares:
            lines.append('    log level = 3 vfs:5 audit:5')
        
        lines.append('')
        
        # Shares sections
        for share_name, share_config in config.get('shares', {}).items():
            lines.append(f'[{share_name}]')
            for key, value in share_config.items():
                lines.append(f'    {key} = {value}')
            lines.append('')
        
        return '\n'.join(lines)
    
    def get_share(self, share_name: str) -> Optional[Dict]:
        """Get a specific share configuration"""
        config = self.read_config()
        return config['shares'].get(share_name)
    
    def create_share(self, share_name: str, share_config: Dict) -> bool:
        """Create a new Samba share"""
        config = self.read_config()
        
        if share_name in config['shares']:
            logger.warning(f"Share {share_name} already exists")
            return False
        
        config['shares'][share_name] = share_config
        return self.write_config(config)
    
    def update_share(self, share_name: str, share_config: Dict) -> bool:
        """Update an existing Samba share"""
        config = self.read_config()
        
        if share_name not in config['shares']:
            logger.warning(f"Share {share_name} does not exist")
            return False
        
        config['shares'][share_name] = share_config
        return self.write_config(config)
    
    def delete_share(self, share_name: str) -> bool:
        """Delete a Samba share"""
        config = self.read_config()
        
        if share_name not in config['shares']:
            logger.warning(f"Share {share_name} does not exist")
            return False
        
        del config['shares'][share_name]
        return self.write_config(config)
    
    def get_global_config(self) -> Dict:
        """Get global Samba configuration"""
        config = self.read_config()
        return config.get('global', {})
    
    def update_global_config(self, global_config: Dict) -> bool:
        """Update global Samba configuration"""
        config = self.read_config()
        config['global'] = global_config
        return self.write_config(config)
    
    def get_all_shares(self) -> List[Dict]:
        """Get all Samba shares as list with names"""
        config = self.read_config()
        shares = []
        
        for share_name, share_config in config.get('shares', {}).items():
            vfs_objects = share_config.get('vfs objects', '')
            audit_enabled = 'full_audit' in vfs_objects if vfs_objects else False
            
            share_info = {
                'name': share_name,
                'path': share_config.get('path', ''),
                'browseable': share_config.get('browseable', 'yes') == 'yes',
                'writable': share_config.get('read only', 'yes') == 'no',  # Inverted logic
                'valid_users': share_config.get('valid users'),
                'force_group': share_config.get('force group'),
                'audit_enabled': audit_enabled
            }
            shares.append(share_info)
        
        return shares
    
    # Audit functionality methods
    def setup_audit_logging(self) -> Dict:
        """Set up rsyslog configuration for Samba audit logging"""
        try:
            results = {}
            
            # Create rsyslog configuration
            rsyslog_config = "local7.* /var/log/samba-audit.log\nlocal7.* stop\n"
            
            # Write rsyslog config
            with tempfile.NamedTemporaryFile(mode='w', delete=False) as temp_file:
                temp_file.write(rsyslog_config)
                temp_path = temp_file.name
            
            # Copy to actual location
            copy_result = self.execute_command(f'cp {temp_path} {self.rsyslog_config_file}')
            os.unlink(temp_path)
            
            if copy_result[0] != 0:
                results['rsyslog_config'] = f'failed: {copy_result[2]}'
                logger.warning(f"Could not create rsyslog config: {copy_result[2]}")
            else:
                results['rsyslog_config'] = 'success'
                logger.info("Created rsyslog configuration for Samba audit")
            
            # Create audit log file if it doesn't exist
            returncode, stdout, stderr = self.execute_command(f'touch {self.audit_log_file}')
            if returncode == 0:
                results['audit_log'] = 'success'
                logger.info(f"Created audit log file: {self.audit_log_file}")
                
                # Set proper ownership and permissions
                self.execute_command(f'chown syslog:adm {self.audit_log_file}')
                self.execute_command(f'chmod 640 {self.audit_log_file}')
            else:
                results['audit_log'] = f'failed: {stderr}'
                logger.warning(f"Could not create audit log file: {stderr}")
            
            # Restart rsyslog
            restart_result = self.execute_command('systemctl restart rsyslog')
            if restart_result[0] == 0:
                results['rsyslog_restart'] = 'success'
                logger.info("Restarted rsyslog service")
            else:
                results['rsyslog_restart'] = f'failed: {restart_result[2]}'
                logger.warning(f"Could not restart rsyslog: {restart_result[2]}")
            
            return {'success': True, 'results': results}
            
        except Exception as e:
            logger.error(f"Error setting up audit logging: {e}")
            return {'success': False, 'message': str(e)}
    
    def get_audit_logs(self, lines: int = 100) -> Dict:
        """Get audit logs from the Samba audit file"""
        try:
            # Check if audit log file exists
            returncode, stdout, stderr = self.execute_command(f'test -f {self.audit_log_file}', use_sudo=False)
            if returncode != 0:
                return {'success': False, 'message': f'Audit log file not found: {self.audit_log_file}'}
            
            # Read the last N lines from the audit log
            returncode, stdout, stderr = self.execute_command(f'tail -n {lines} {self.audit_log_file}', use_sudo=False)
            
            if returncode == 0:
                log_lines = stdout.strip().split('\n') if stdout.strip() else []
                return {
                    'success': True, 
                    'logs': log_lines,
                    'total_lines': len(log_lines),
                    'file_path': self.audit_log_file
                }
            else:
                return {'success': False, 'message': f'Failed to read audit logs: {stderr}'}
                
        except Exception as e:
            logger.error(f"Error getting audit logs: {e}")
            return {'success': False, 'message': str(e)}
    
    # Service management methods
    def configure_zfs_for_samba(self, dataset_path: str) -> Dict:
        """Configure ZFS dataset properties for Samba compatibility"""
        try:
            # Extract dataset name from path (e.g., /tank/sharedfolder -> tank/sharedfolder)
            if dataset_path.startswith('/'):
                # Remove leading slash and split to get pool/dataset
                path_parts = dataset_path.lstrip('/').split('/')
                if len(path_parts) >= 2:
                    dataset_name = f"{path_parts[0]}/{path_parts[1]}"
                else:
                    return {'success': False, 'message': 'Invalid dataset path'}
                
                results = {}
                
                # Set ZFS properties for Samba compatibility
                try:
                    returncode, stdout, stderr = self.execute_command(
                        f'zfs set acltype=posixacl {dataset_name}'
                    )
                    if returncode == 0:
                        results['acltype'] = 'success'
                        logger.info(f"Set ZFS acltype for dataset: {dataset_name}")
                    else:
                        results['acltype'] = f'failed: {stderr}'
                        logger.warning(f"Could not set acltype for {dataset_name}: {stderr}")
                except Exception as e:
                    results['acltype'] = f'error: {str(e)}'
                    logger.warning(f"Exception setting acltype for {dataset_name}: {e}")
                
                try:
                    returncode, stdout, stderr = self.execute_command(
                        f'zfs set xattr=sa {dataset_name}'
                    )
                    if returncode == 0:
                        results['xattr'] = 'success'
                        logger.info(f"Set ZFS xattr for dataset: {dataset_name}")
                    else:
                        results['xattr'] = f'failed: {stderr}'
                        logger.warning(f"Could not set xattr for {dataset_name}: {stderr}")
                except Exception as e:
                    results['xattr'] = f'error: {str(e)}'
                    logger.warning(f"Exception setting xattr for {dataset_name}: {e}")
                
                return {'success': True, 'results': results}
            else:
                return {'success': False, 'message': 'Not a valid dataset path'}
                
        except Exception as e:
            logger.error(f"Error configuring ZFS for Samba: {e}")
            return {'success': False, 'message': str(e)}
    
    def set_linux_permissions(self, path: str, force_group: str = None) -> Dict:
        """Set Linux filesystem permissions for Samba share - FIXED VERSION"""
        try:
            results = {}
            
            # Ensure the directory exists
            if not os.path.exists(path):
                return {'success': False, 'message': f'Path does not exist: {path}'}
            
            if force_group:
                # Set ownership: root for owner, force_group for group
                try:
                    returncode, stdout, stderr = self.execute_command(
                        f'chown -R root:{force_group} {path}'
                    )
                    if returncode == 0:
                        results['chown'] = 'success'
                        logger.info(f"Set ownership to root:{force_group} for {path}")
                    else:
                        results['chown'] = f'failed: {stderr}'
                        logger.warning(f"Could not set ownership for {path}: {stderr}")
                except Exception as e:
                    results['chown'] = f'error: {str(e)}'
                    logger.warning(f"Exception setting ownership for {path}: {e}")
                
                # Set permissions: 2775 (rwxrwsr-x) - SGID bit set for directories
                try:
                    returncode, stdout, stderr = self.execute_command(
                        f'chmod -R 2775 {path}'
                    )
                    if returncode == 0:
                        results['chmod'] = 'success'
                        logger.info(f"Set permissions 2775 for {path}")
                    else:
                        results['chmod'] = f'failed: {stderr}'
                        logger.warning(f"Could not set permissions for {path}: {stderr}")
                except Exception as e:
                    results['chmod'] = f'error: {str(e)}'
                    logger.warning(f"Exception setting permissions for {path}: {e}")
                
                # Ensure SGID bit is set on directories specifically
                try:
                    returncode, stdout, stderr = self.execute_command(
                        f'find {path} -type d -exec chmod g+s {{}} \\;'
                    )
                    if returncode == 0:
                        results['sgid'] = 'success'
                        logger.info(f"Set SGID bit for directories in: {path}")
                    else:
                        results['sgid'] = f'failed: {stderr}'
                        logger.warning(f"Could not set SGID bit for {path}: {stderr}")
                except Exception as e:
                    results['sgid'] = f'error: {str(e)}'
                    logger.warning(f"Exception setting SGID bit for {path}: {e}")
                    
            else:
                # Default permissions without forced group
                try:
                    returncode, stdout, stderr = self.execute_command(
                        f'chown -R root:root {path}'
                    )
                    if returncode == 0:
                        results['chown'] = 'success'
                        logger.info(f"Set default ownership to root:root for {path}")
                    else:
                        results['chown'] = f'failed: {stderr}'
                        logger.warning(f"Could not set default ownership for {path}: {stderr}")
                except Exception as e:
                    results['chown'] = f'error: {str(e)}'
                    logger.warning(f"Exception setting default ownership for {path}: {e}")
                
                try:
                    returncode, stdout, stderr = self.execute_command(
                        f'chmod -R 755 {path}'
                    )
                    if returncode == 0:
                        results['chmod'] = 'success'
                        logger.info(f"Set default permissions 755 for: {path}")
                    else:
                        results['chmod'] = f'failed: {stderr}'
                        logger.warning(f"Could not set permissions for {path}: {stderr}")
                except Exception as e:
                    results['chmod'] = f'error: {str(e)}'
                    logger.warning(f"Exception setting permissions for {path}: {e}")
            
            return {'success': True, 'results': results}
            
        except Exception as e:
            logger.error(f"Error setting Linux permissions: {e}")
            return {'success': False, 'message': str(e)}
    
    def create_share_with_permissions(self, share_name: str, path: str, browseable: bool = True, 
                                    writable: bool = True, valid_users: str = None, 
                                    force_group: str = None, audit_enabled: bool = False) -> Dict:
        """Create Samba share with proper configuration and permissions - with audit support"""
        try:
            # Verify path exists
            if not os.path.exists(path):
                return {'success': False, 'message': f'Path does not exist: {path}'}
            
            # Prepare share configuration
            share_config = {
                'path': path,
                'browseable': 'yes' if browseable else 'no',
                'read only': 'no' if writable else 'yes',
                'guest ok': 'no',  # No guest access
                'create mask': '0664',
                'directory mask': '0775',
                'inherit permissions': 'yes',
                'inherit owner': 'yes'
            }
            
            # Add audit configuration if enabled
            if audit_enabled:
                # Set up audit logging first
                audit_setup = self.setup_audit_logging()
                if not audit_setup.get('success'):
                    logger.warning(f"Audit setup failed: {audit_setup.get('message')}")
                
                # Add audit VFS objects and settings
                share_config['vfs objects'] = 'acl_xattr full_audit'
                share_config['full_audit:prefix'] = '%u|%I|%m|%S'
                share_config['full_audit:success'] = 'connect disconnect mkdirat unlinkat read write renameat readdir'
                share_config['full_audit:failure'] = 'none'
                share_config['full_audit:facility'] = 'local7'
                share_config['full_audit:priority'] = 'notice'
            
            # STRICT ACCESS CONTROL - Only allow specified users/groups
            if valid_users:
                # Use explicitly specified valid users
                share_config['valid users'] = valid_users
                share_config['invalid users'] = 'root'  # Explicitly deny root
            elif force_group:
                # If force_group is specified but no valid_users, only allow that group
                share_config['valid users'] = f'@{force_group}'
                share_config['invalid users'] = 'root'
            else:
                # If neither valid_users nor force_group specified, deny all access by default
                share_config['valid users'] = 'nobody'  # Non-existent user
                share_config['invalid users'] = 'all'   # Deny all users
            
            if force_group:
                share_config['force group'] = force_group
                share_config['force directory mode'] = '2775'
                share_config['force create mode'] = '0664'
                share_config['inherit acls'] = 'yes'
            
            # Configure ZFS dataset for Samba if it's a ZFS dataset
            zfs_result = self.configure_zfs_for_samba(path)
            if not zfs_result.get('success'):
                logger.warning(f"ZFS configuration warning: {zfs_result.get('message')}")
            
            # Set Linux permissions
            perm_result = self.set_linux_permissions(path, force_group)
            if not perm_result.get('success'):
                return {'success': False, 'message': f'Failed to set permissions: {perm_result.get("message")}'}
            
            # Create share in Samba config
            success = self.create_share(share_name, share_config)
            if not success:
                return {'success': False, 'message': 'Failed to create Samba share in configuration file'}
            
            # Test Samba configuration
            test_result = self.test_samba_config()
            if not test_result.get('success'):
                # Rollback: delete the share if config test fails
                self.delete_share(share_name)
                return {'success': False, 'message': f'Samba configuration test failed: {test_result.get("message")}'}
            
            # Restart Samba services
            restart_result = self.restart_samba_services()
            if not restart_result.get('success'):
                logger.warning(f"Failed to restart Samba services: {restart_result.get('message')}")
                # Don't fail the entire operation if restart fails, but warn
                return {'success': True, 'message': f'Samba share created but services may need restart: {restart_result.get("message")}'}
            
            return {'success': True, 'message': f'Samba share {share_name} created successfully'}
            
        except Exception as e:
            logger.error(f"Error creating Samba share: {e}")
            # Clean up on error
            try:
                self.delete_share(share_name)
            except:
                pass
            return {'success': False, 'message': str(e)}
    
    def fix_share_permissions(self, share_name: str) -> Dict:
        """Fix permissions for an existing share to enforce proper access control"""
        try:
            config = self.read_config()
            
            if share_name not in config['shares']:
                return {'success': False, 'message': f'Share {share_name} does not exist'}
            
            share_config = config['shares'][share_name]
            path = share_config.get('path', '')
            force_group = share_config.get('force group')
            
            if not path:
                return {'success': False, 'message': f'Share {share_name} has no path configured'}
            
            # Update share configuration with strict access control
            if 'valid users' not in share_config:
                if force_group:
                    share_config['valid users'] = f'@{force_group}'
                else:
                    share_config['valid users'] = 'nobody'
            
            share_config['invalid users'] = 'root'
            share_config['guest ok'] = 'no'
            
            # Write updated config
            if not self.write_config(config):
                return {'success': False, 'message': 'Failed to update Samba configuration'}
            
            # Test and restart Samba
            test_result = self.test_samba_config()
            if not test_result.get('success'):
                return {'success': False, 'message': f'Configuration test failed after update: {test_result.get("message")}'}
            
            restart_result = self.restart_samba_services()
            if not restart_result.get('success'):
                return {'success': False, 'message': f'Failed to restart Samba services: {restart_result.get("message")}'}
            
            return {'success': True, 'message': f'Share {share_name} permissions fixed successfully'}
            
        except Exception as e:
            logger.error(f"Error fixing share permissions: {e}")
            return {'success': False, 'message': str(e)}

    def fix_all_shares_permissions(self) -> Dict:
        """Fix permissions for all existing shares"""
        try:
            config = self.read_config()
            fixed_shares = []
            
            for share_name, share_config in config.get('shares', {}).items():
                path = share_config.get('path', '')
                force_group = share_config.get('force group')
                
                if path:
                    # Update share configuration with strict access control
                    if 'valid users' not in share_config:
                        if force_group:
                            share_config['valid users'] = f'@{force_group}'
                        else:
                            share_config['valid users'] = 'nobody'
                    
                    share_config['invalid users'] = 'root'
                    share_config['guest ok'] = 'no'
                    fixed_shares.append(share_name)
            
            if fixed_shares:
                if not self.write_config(config):
                    return {'success': False, 'message': 'Failed to update Samba configuration'}
                
                # Test and restart Samba
                test_result = self.test_samba_config()
                if not test_result.get('success'):
                    return {'success': False, 'message': f'Configuration test failed after update: {test_result.get("message")}'}
                
                restart_result = self.restart_samba_services()
                if not restart_result.get('success'):
                    return {'success': False, 'message': f'Failed to restart Samba services: {restart_result.get("message")}'}
            
            return {'success': True, 'message': f'Fixed permissions for {len(fixed_shares)} shares', 'fixed_shares': fixed_shares}
            
        except Exception as e:
            logger.error(f"Error fixing all shares permissions: {e}")
            return {'success': False, 'message': str(e)}
    
    def test_samba_config(self) -> Dict:
        """Test Samba configuration with testparm"""
        try:
            returncode, stdout, stderr = self.execute_command('testparm -s')
            if returncode == 0:
                logger.info("Samba configuration test passed")
                return {'success': True, 'message': 'Configuration test passed', 'output': stdout}
            else:
                logger.warning(f"Samba configuration test failed: {stderr}")
                return {'success': False, 'message': f'Configuration test failed: {stderr}', 'output': stderr}
        except Exception as e:
            logger.error(f"Error testing Samba configuration: {e}")
            return {'success': False, 'message': str(e)}
    
    def restart_samba_services(self) -> Dict:
        """Restart Samba services"""
        try:
            results = {}
            
            # Restart smbd
            returncode, stdout, stderr = self.execute_command('systemctl restart smbd')
            if returncode == 0:
                results['smbd'] = 'restarted'
                logger.info("Samba smbd service restarted successfully")
            else:
                results['smbd'] = f'failed: {stderr}'
                logger.warning(f"Could not restart smbd: {stderr}")
            
            # Restart nmbd
            returncode, stdout, stderr = self.execute_command('systemctl restart nmbd')
            if returncode == 0:
                results['nmbd'] = 'restarted'
                logger.info("Samba nmbd service restarted successfully")
            else:
                results['nmbd'] = f'failed: {stderr}'
                logger.warning(f"Could not restart nmbd: {stderr}")
            
            return {'success': True, 'results': results}
            
        except Exception as e:
            logger.error(f"Error restarting Samba services: {e}")
            return {'success': False, 'message': str(e)}
    
    def setup_samba_user(self, username: str, password: str) -> Dict:
        """Setup Samba user account - FIXED COMMAND"""
        try:
            # First check if user already exists in Samba
            returncode, stdout, stderr = self.execute_command(f'pdbedit -L | grep ^{username}:')
            if returncode == 0:
                # User already exists, just enable them
                returncode, stdout, stderr = self.execute_command(f'smbpasswd -e {username}')
                if returncode == 0:
                    logger.info(f"Samba user {username} enabled successfully")
                    return {'success': True, 'message': f'Samba user {username} enabled successfully'}
                else:
                    return {'success': False, 'message': f'Failed to enable existing Samba user: {stderr}'}
            
            # Create new Samba user using stdin input
            password_input = f"{password}\n{password}\n"
            returncode, stdout, stderr = self.execute_command(
                f'smbpasswd -a -s {username}',
                input_text=password_input
            )
            
            if returncode != 0:
                return {'success': False, 'message': f'Failed to add Samba user: {stderr}'}
            
            # Enable Samba account
            returncode, stdout, stderr = self.execute_command(f'smbpasswd -e {username}')
            if returncode != 0:
                return {'success': False, 'message': f'Failed to enable Samba user: {stderr}'}
            
            logger.info(f"Samba user {username} setup successfully")
            return {'success': True, 'message': f'Samba user {username} setup successfully'}
            
        except Exception as e:
            logger.error(f"Error setting up Samba user: {e}")
            return {'success': False, 'message': str(e)}
    
    def disable_samba_user(self, username: str) -> Dict:
        """Disable Samba user account - FIXED COMMAND"""
        try:
            returncode, stdout, stderr = self.execute_command(f'smbpasswd -d {username}')
            if returncode == 0:
                logger.info(f"Samba user {username} disabled successfully")
                return {'success': True, 'message': f'Samba user {username} disabled'}
            else:
                return {'success': False, 'message': f'Failed to disable Samba user: {stderr}'}
        except Exception as e:
            logger.error(f"Error disabling Samba user: {e}")
            return {'success': False, 'message': str(e)}
    
    def enable_samba_user(self, username: str) -> Dict:
        """Enable Samba user account - FIXED COMMAND"""
        try:
            returncode, stdout, stderr = self.execute_command(f'smbpasswd -e {username}')
            if returncode == 0:
                logger.info(f"Samba user {username} enabled successfully")
                return {'success': True, 'message': f'Samba user {username} enabled'}
            else:
                return {'success': False, 'message': f'Failed to enable Samba user: {stderr}'}
        except Exception as e:
            logger.error(f"Error enabling Samba user: {e}")
            return {'success': False, 'message': str(e)}
    
    def remove_samba_user(self, username: str) -> Dict:
        """Remove Samba user account - FIXED COMMAND"""
        try:
            returncode, stdout, stderr = self.execute_command(f'smbpasswd -x {username}')
            if returncode == 0:
                logger.info(f"Samba user {username} removed successfully")
                return {'success': True, 'message': f'Samba user {username} removed'}
            else:
                return {'success': False, 'message': f'Failed to remove Samba user: {stderr}'}
        except Exception as e:
            logger.error(f"Error removing Samba user: {e}")
            return {'success': False, 'message': str(e)}