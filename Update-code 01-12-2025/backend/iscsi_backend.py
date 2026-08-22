 #!/usr/bin/env python3
# iscsi_backend.py

import subprocess
import json
import re
import os
from typing import Dict, List, Optional

class ISCSIBackend:
    def __init__(self):
        self.iqn_prefix = "iqn.2025-09.local.ubuntu"
    
    def execute_command(self, command: str) -> tuple:
        """Execute shell command and return result"""
        try:
            print(f"Running command: {command}")
            result = subprocess.run(
                command, 
                shell=True, 
                capture_output=True, 
                text=True, 
                executable='/bin/bash'
            )
            print(f"Command returncode: {result.returncode}")
            if result.stdout:
                print(f"Command stdout: {result.stdout}")
            if result.stderr:
                print(f"Command stderr: {result.stderr}")
            return result.returncode, result.stdout, result.stderr
        except Exception as e:
            print(f"Command exception: {e}")
            return -1, "", str(e)
    
    def get_system_status(self) -> Dict:
        """Get iSCSI system status - FIXED with proper service detection"""
        services = {}

        # Check target service with proper status detection
        returncode, stdout, stderr = self.execute_command("sudo systemctl is-active target")
        target_active = stdout.strip() if returncode == 0 else 'inactive'
        services['target'] = target_active

        # Get detailed status for target - check for running or exited state (both indicate service is working)
        returncode, stdout, stderr = self.execute_command("sudo systemctl show target --property=ActiveState,SubState --no-pager")
        if returncode == 0:
            if 'ActiveState=active' in stdout and ('SubState=running' in stdout or 'SubState=exited' in stdout):
                services['target_detailed'] = 'running'
            else:
                services['target_detailed'] = 'stopped'
        else:
            services['target_detailed'] = 'unknown'

        # Overall iSCSI service status (only based on target service now)
        if services.get('target_detailed') == 'running':
            services['overall'] = 'running'
        else:
            services['overall'] = 'stopped'

        return services
    
    # ... rest of the existing methods remain exactly the same ...
    def get_targets(self) -> List[Dict]:
        """Get all iSCSI targets"""
        print("=== GETTING TARGETS ===")
        
        cmd = "sudo targetcli ls /iscsi 2>/dev/null"
        returncode, stdout, stderr = self.execute_command(cmd)
        
        targets = []
        
        if returncode == 0 and stdout:
            iqn_pattern = r'o-\s+(iqn\.[^\.\s]+(?:\.[^\.\s]+)*:[^\.\s]+)'
            lines = stdout.split('\n')
            
            current_target = None
            
            for line in lines:
                line = line.strip()
                
                if line.startswith('o- iqn.') and ('[TPGs:' in line or 'TPGs:' in line):
                    if current_target:
                        targets.append(current_target)
                    
                    target_match = re.search(iqn_pattern, line)
                    if target_match:
                        target_iqn = target_match.group(1)
                        current_target = {
                            'iqn': target_iqn,
                            'tpg_groups': ['tpg1'],
                            'luns': [],
                            'acls': [],
                            'portals': [{'ip': '0.0.0.0', 'port': '3260'}],
                            'authentication': False
                        }
                        print(f"Found target: {target_iqn}")
                
                elif current_target:
                    if 'o- lun' in line and 'block/' in line:
                        lun_match = re.search(r'o- lun(\d+)[.\s]+\[([^]]+)\]', line)
                        if lun_match:
                            lun_info = lun_match.group(2)
                            backstore = 'unknown'
                            if 'block/' in lun_info:
                                backstore_match = re.search(r'block/([^\s\(]+)', lun_info)
                                if backstore_match:
                                    backstore = backstore_match.group(1)
                            # Extract the full path from the lun_info
                            path = 'unknown'
                            if '(/dev/zvol/' in lun_info:
                                path_match = re.search(r'\(/dev/zvol/([^\)]+)\)', lun_info)
                                if path_match:
                                    path = f"/dev/zvol/{path_match.group(1)}"

                            current_target['luns'].append({
                                'id': lun_match.group(1),
                                'backstore': backstore,
                                'path': path
                            })
                            print(f"  - LUN {lun_match.group(1)}: {backstore}")
                    
                    elif 'o- iqn.' in line and 'Mapped LUNs' in line:
                        acl_match = re.search(iqn_pattern, line)
                        if acl_match:
                            acl_iqn = acl_match.group(1)
                            current_target['acls'].append(acl_iqn)
                            print(f"  - ACL: {acl_iqn}")
                    
                    elif 'attribute authentication=' in line:
                        auth_match = re.search(r'authentication=(\d)', line)
                        if auth_match:
                            current_target['authentication'] = auth_match.group(1) == '1'
            
            if current_target:
                targets.append(current_target)
        
        print(f"Returning {len(targets)} targets")
        return targets
    
    def check_zvol_exists(self, zvol_path: str) -> bool:
        """Check if ZVOL exists and is accessible"""
        print(f"Checking if ZVOL exists: {zvol_path}")
        
        # First check with ls command
        check_cmd = f"sudo ls {zvol_path}"
        returncode, stdout, stderr = self.execute_command(check_cmd)
        
        if returncode == 0:
            print(f"ZVOL found via ls: {zvol_path}")
            return True
        
        # If ls fails, check with zfs list
        zvol_name = zvol_path.replace('/dev/zvol/', '')
        check_zfs_cmd = f"sudo zfs list -H -o name {zvol_name}"
        returncode, stdout, stderr = self.execute_command(check_zfs_cmd)
        
        if returncode == 0 and stdout.strip() == zvol_name:
            print(f"ZVOL found via zfs list: {zvol_name}")
            return True
        
        print(f"ZVOL not found: {zvol_path}")
        return False
    
    def get_actual_target_iqn(self, target_name: str) -> str:
        """Get the actual IQN as stored by targetcli (handles case conversion)"""
        # Targetcli often converts target names to lowercase
        # Let's check what targetcli actually created
        check_cmd = "sudo targetcli ls /iscsi 2>/dev/null"
        returncode, stdout, stderr = self.execute_command(check_cmd)
        
        if returncode == 0 and stdout:
            # Look for our target in the output
            expected_iqn = f"{self.iqn_prefix}:{target_name}"
            expected_iqn_lower = expected_iqn.lower()
            
            lines = stdout.split('\n')
            for line in lines:
                if 'o- iqn.' in line and expected_iqn_lower in line.lower():
                    # Extract the actual IQN from the line
                    iqn_match = re.search(r'(iqn\.[^\.\s]+\.[^\.\s]+:[^\.\s]+)', line)
                    if iqn_match:
                        actual_iqn = iqn_match.group(1)
                        print(f"Found actual IQN: {actual_iqn}")
                        return actual_iqn
        
        # If not found, return the lowercase version (targetcli's default behavior)
        return f"{self.iqn_prefix}:{target_name}".lower()
    
    def create_target(self, target_name: str, zvol_path: str) -> Dict:
        """Create iSCSI target with ZVOL - Authentication always disabled"""
        print(f"=== STARTING TARGET CREATION ===")
        print(f"Target name: {target_name}")
        print(f"ZVOL path: {zvol_path}")
        
        # Validate inputs
        if not target_name or not zvol_path:
            error_msg = 'Target name and ZVOL path are required'
            print(f"Validation failed: {error_msg}")
            return {'success': False, 'error': error_msg}
        
        # Validate target name format
        if not re.match(r'^[a-zA-Z0-9\-_]+$', target_name):
            error_msg = 'Target name can only contain letters, numbers, hyphens, and underscores'
            print(f"Validation failed: {error_msg}")
            return {'success': False, 'error': error_msg}
        
        # Check if ZVOL exists
        if not self.check_zvol_exists(zvol_path):
            error_msg = f'ZVOL path does not exist or is not accessible: {zvol_path}. Please create the ZFS volume first.'
            print(f"Validation failed: {error_msg}")
            return {'success': False, 'error': error_msg}
        
        iqn = f"{self.iqn_prefix}:{target_name}"
        print(f"Expected IQN: {iqn}")
        
        # Check if target already exists
        check_target_cmd = f"sudo targetcli ls /iscsi/{iqn} 2>/dev/null"
        returncode, stdout, stderr = self.execute_command(check_target_cmd)
        if returncode == 0:
            error_msg = f'Target with IQN {iqn} already exists'
            print(f"Validation failed: {error_msg}")
            return {'success': False, 'error': error_msg}
        
        # Step 1: Create backstore
        print("=== STEP 1: Creating backstore ===")
        backstore_cmd = f"sudo targetcli backstores/block create {target_name} {zvol_path}"
        returncode, stdout, stderr = self.execute_command(backstore_cmd)
        if returncode != 0:
            error_msg = stderr.strip()
            if "exists" in error_msg.lower():
                print("Backstore exists, trying to delete and recreate...")
                # Backstore might already exist, try to delete it first
                self.execute_command(f"sudo targetcli backstores/block delete {target_name}")
                # Try again
                returncode, stdout, stderr = self.execute_command(backstore_cmd)
                if returncode != 0:
                    error_msg = f"Backstore creation failed even after cleanup: {stderr}"
                    print(f"Backstore creation failed: {error_msg}")
                    return {'success': False, 'error': error_msg}
            else:
                error_msg = f"Backstore creation failed: {stderr}"
                print(f"Backstore creation failed: {error_msg}")
                return {'success': False, 'error': error_msg}
        
        print("✓ Backstore created successfully")
        
        # Step 2: Create target
        print("=== STEP 2: Creating target ===")
        target_cmd = f"sudo targetcli iscsi/ create {iqn}"
        returncode, stdout, stderr = self.execute_command(target_cmd)
        if returncode != 0:
            error_msg = f"Target creation failed: {stderr}"
            print(f"Target creation failed: {error_msg}")
            # Clean up backstore if target creation fails
            self.execute_command(f"sudo targetcli backstores/block delete {target_name}")
            return {'success': False, 'error': error_msg}
        
        print("✓ Target created successfully")
        
        # Step 3: Get the actual IQN (targetcli might change case)
        print("=== STEP 3: Getting actual IQN ===")
        actual_iqn = self.get_actual_target_iqn(target_name)
        print(f"Using actual IQN: {actual_iqn}")
        
        # Step 4: Create LUN
        print("=== STEP 4: Creating LUN ===")
        lun_cmd = f"sudo targetcli iscsi/{actual_iqn}/tpg1/luns/ create /backstores/block/{target_name}"
        returncode, stdout, stderr = self.execute_command(lun_cmd)
        if returncode != 0:
            error_msg = f"LUN creation failed: {stderr}"
            print(f"LUN creation failed: {error_msg}")
            # Clean up if LUN creation fails
            self.execute_command(f"sudo targetcli iscsi/ delete {actual_iqn}")
            self.execute_command(f"sudo targetcli backstores/block delete {target_name}")
            return {'success': False, 'error': error_msg}
        
        print("✓ LUN created successfully")
        
        # Step 5: Set attributes - ALWAYS DISABLE AUTHENTICATION
        # Note: Portal is automatically created by targetcli, so we skip portal creation
        print("=== STEP 5: Setting attributes ===")
        attr_cmd = f"sudo targetcli iscsi/{actual_iqn}/tpg1 set attribute authentication=0 demo_mode_write_protect=0 generate_node_acls=1 cache_dynamic_acls=1"
        returncode, stdout, stderr = self.execute_command(attr_cmd)
        if returncode != 0:
            print(f"Warning: Attribute setting failed but continuing: {stderr}")
        else:
            print("✓ Attributes set successfully")
        
        # Step 6: Save config
        print("=== STEP 6: Saving configuration ===")
        self.execute_command("sudo targetcli saveconfig")
        print("✓ Configuration saved")
        
        success_msg = f"Target {actual_iqn} created successfully"
        print(f"=== TARGET CREATION COMPLETE: {success_msg} ===")
        return {'success': True, 'message': success_msg}
    
    def delete_target(self, target_iqn: str) -> Dict:
        """Delete iSCSI target"""
        print(f"Deleting target: {target_iqn}")
        
        # Get the target name from IQN
        target_name = target_iqn.split(':')[-1]
        
        # Delete target
        target_cmd = f"sudo targetcli iscsi/ delete {target_iqn}"
        returncode, stdout, stderr = self.execute_command(target_cmd)
        if returncode != 0:
            return {'success': False, 'error': f"Target deletion failed: {stderr}"}
        
        # Delete backstore
        backstore_cmd = f"sudo targetcli backstores/block delete {target_name}"
        self.execute_command(backstore_cmd)
        
        # Save config
        self.execute_command("sudo targetcli saveconfig")
        
        return {'success': True, 'message': f"Target {target_iqn} deleted successfully"}
    
    def add_acl(self, target_iqn: str, client_iqn: str) -> Dict:
        """Add ACL for specific client"""
        acl_cmd = f"sudo targetcli iscsi/{target_iqn}/tpg1/acls/ create {client_iqn}"
        returncode, stdout, stderr = self.execute_command(acl_cmd)
        
        if returncode == 0:
            # Set generate_node_acls to 0 when using explicit ACLs
            attr_cmd = f"sudo targetcli iscsi/{target_iqn}/tpg1 set attribute generate_node_acls=0"
            self.execute_command(attr_cmd)
            self.execute_command("sudo targetcli saveconfig")
            return {'success': True, 'message': f"ACL for {client_iqn} added"}
        else:
            return {'success': False, 'error': f"ACL creation failed: {stderr}"}
    
    def remove_acl(self, target_iqn: str, client_iqn: str) -> Dict:
        """Remove ACL"""
        # First check if ACL exists
        check_cmd = f"sudo targetcli ls /iscsi/{target_iqn}/tpg1/acls/{client_iqn} 2>/dev/null"
        returncode, stdout, stderr = self.execute_command(check_cmd)

        if returncode != 0:
            return {'success': False, 'error': f"ACL not found: {client_iqn}"}

        acl_cmd = f"sudo targetcli iscsi/{target_iqn}/tpg1/acls/ delete {client_iqn}"
        returncode, stdout, stderr = self.execute_command(acl_cmd)

        if returncode == 0:
            # Check if there are any remaining ACLs
            list_cmd = f"sudo targetcli ls /iscsi/{target_iqn}/tpg1/acls/ 2>/dev/null"
            returncode, stdout, stderr = self.execute_command(list_cmd)

            # If no more ACLs, set generate_node_acls back to 1 and disable authentication
            if returncode != 0 or '[ACLs: 0]' in stdout:
                attr_cmd = f"sudo targetcli iscsi/{target_iqn}/tpg1 set attribute generate_node_acls=1 authentication=0"
                self.execute_command(attr_cmd)
                print(f"Disabled authentication for target {target_iqn} - no ACLs remaining")

            self.execute_command("sudo targetcli saveconfig")
            return {'success': True, 'message': f"ACL for {client_iqn} removed"}
        else:
            return {'success': False, 'error': f"ACL removal failed: {stderr}"}

    def restore_targets(self) -> Dict:
        """Restore iSCSI targets from saved configuration using targetctl restore"""
        print("=== STARTING TARGET RESTORE ===")

        try:
            # Check if target service is running
            status_check = self.get_system_status()
            if status_check.get('overall') != 'running':
                return {
                    'success': False,
                    'message': 'iSCSI target service is not running. Please start the service first.'
                }

            # Execute targetctl restore command
            restore_cmd = "sudo targetctl restore"
            returncode, stdout, stderr = self.execute_command(restore_cmd)

            if returncode == 0:
                print("✓ Targets restored successfully")
                # Get updated targets list to return
                targets = self.get_targets()
                return {
                    'success': True,
                    'message': 'iSCSI targets restored successfully',
                    'targets_restored': len(targets),
                    'targets': targets
                }
            else:
                error_msg = stderr.strip()
                print(f"Target restore failed: {error_msg}")

                # Check for specific error conditions
                if "no such file" in error_msg.lower() or "config" in error_msg.lower():
                    return {
                        'success': False,
                        'message': 'No saved iSCSI configuration found to restore'
                    }
                elif "permission denied" in error_msg.lower() or "sudo" in error_msg.lower():
                    return {
                        'success': False,
                        'message': 'Permission denied: sudo access required for target restore'
                    }
                else:
                    return {
                        'success': False,
                        'message': f'Failed to restore iSCSI targets: {error_msg}'
                    }

        except Exception as e:
            print(f"Exception during target restore: {e}")
            return {
                'success': False,
                'message': f'Exception during target restore: {str(e)}'
            }

    def get_saveconfig(self) -> Dict:
        """Get the saved iSCSI configuration from saveconfig.json"""
        print("=== GETTING SAVED CONFIG ===")

        try:
            cmd = "sudo cat /etc/rtslib-fb-target/saveconfig.json"
            returncode, stdout, stderr = self.execute_command(cmd)

            if returncode == 0:
                try:
                    config = json.loads(stdout)
                    return {'success': True, 'config': config}
                except json.JSONDecodeError as e:
                    return {'success': False, 'error': f'Invalid JSON in saveconfig.json: {str(e)}'}
            else:
                error_msg = stderr.strip()
                return {'success': False, 'error': error_msg}

        except Exception as e:
            print(f"Exception during get_saveconfig: {e}")
            return {'success': False, 'error': f'Exception: {str(e)}'}