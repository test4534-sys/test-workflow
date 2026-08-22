#!/usr/bin/env python3
# zfs_manager.py

import subprocess
import json
import re
import logging
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

class ZFSManager:
    def __init__(self):
        self.default_pool_name = "tank"
    
    def execute_command(self, command: str) -> tuple:
        """Execute shell command and return result"""
        try:
            logger.info(f"ZFS Manager - Running command: {command}")
            result = subprocess.run(
                command, 
                shell=True, 
                capture_output=True, 
                text=True, 
                executable='/bin/bash',
                timeout=30
            )
            logger.info(f"ZFS Manager - Command returncode: {result.returncode}")
            
            # Log stderr only if there's an error
            if result.returncode != 0 and result.stderr:
                # Don't log permission denied errors with full command for security
                if "password" in result.stderr.lower() or "sudo" in result.stderr.lower():
                    logger.error(f"ZFS Manager - Permission error: sudo access required")
                else:
                    logger.error(f"ZFS Manager - Command stderr: {result.stderr}")
                    
            return result.returncode, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            logger.error(f"ZFS Manager - Command timed out: {command}")
            return -1, "", "Command execution timed out"
        except Exception as e:
            logger.error(f"ZFS Manager - Command exception: {e}")
            return -1, "", str(e)
    
    def get_pool_status(self) -> Dict:
        """Get ZFS pool status"""
        returncode, stdout, stderr = self.execute_command("sudo zpool status")
        return {
            'status': 'success' if returncode == 0 else 'error',
            'output': stdout,
            'error': stderr
        }
    
    def list_pools(self) -> List[Dict]:
        """List all ZFS pools"""
        returncode, stdout, stderr = self.execute_command("sudo zpool list -H -o name,size,alloc,free,health")
        pools = []
        if returncode == 0:
            for line in stdout.strip().split('\n'):
                if line:
                    parts = line.split('\t')
                    pools.append({
                        'name': parts[0],
                        'size': parts[1],
                        'allocated': parts[2],
                        'free': parts[3],
                        'health': parts[4]
                    })
        return pools
    
    def get_default_pool(self) -> str:
        """Get the first available pool or return default pool name"""
        pools = self.list_pools()
        if pools:
            return pools[0]['name']
        return self.default_pool_name
    
    def create_pool(self, pool_name: str, devices: List[str], mountpoint: str = None, compression: str = None) -> Dict:
        """Create a new ZFS pool with optional compression"""
        try:
            # Check if pool already exists
            returncode, stdout, stderr = self.execute_command(f"sudo zpool list -H {pool_name} 2>/dev/null")
            if returncode == 0:
                return {
                    'success': False,
                    'message': f"Pool {pool_name} already exists"
                }
            
            # Validate devices exist and are accessible
            inaccessible_devices = []
            for device in devices:
                # Use simpler check command
                check_cmd = f"sudo ls {device}"
                returncode, stdout, stderr = self.execute_command(check_cmd)
                if returncode != 0:
                    inaccessible_devices.append(device)
            
            if inaccessible_devices:
                return {
                    'success': False,
                    'message': f"Devices not found or not accessible: {', '.join(inaccessible_devices)}"
                }
            
            # Build create command
            devices_str = ' '.join(devices)
            create_cmd = f"sudo zpool create {pool_name} {devices_str}"
            
            if mountpoint:
                create_cmd += f" -m {mountpoint}"
            
            logger.info(f"Creating pool with command: {create_cmd}")
            returncode, stdout, stderr = self.execute_command(create_cmd)
            
            if returncode == 0:
                # Set compression if specified
                if compression and compression != 'off':
                    comp_cmd = f"sudo zfs set compression={compression} {pool_name}"
                    comp_returncode, comp_stdout, comp_stderr = self.execute_command(comp_cmd)
                    if comp_returncode != 0:
                        logger.warning(f"Failed to set compression: {comp_stderr}")
                        # Continue anyway - pool was created successfully
                
                return {
                    'success': True,
                    'message': f"Pool {pool_name} created successfully" + 
                              (f" with {compression} compression" if compression and compression != 'off' else ""),
                    'pool_name': pool_name
                }
            else:
                # Check for specific error conditions
                error_msg = stderr.strip()
                if "is in use" in error_msg.lower() or "contains a unknown filesystem" in error_msg.lower():
                    return {
                        'success': False,
                        'message': f"Disk is already in use and contains data: {error_msg}"
                    }
                elif "password" in error_msg.lower() or "sudo" in error_msg.lower():
                    return {
                        'success': False,
                        'message': "Permission denied: sudo access required. Please check sudoers configuration."
                    }
                elif "no such device" in error_msg.lower() or "cannot open" in error_msg.lower():
                    return {
                        'success': False,
                        'message': f"One or more devices not found or inaccessible: {devices_str}"
                    }
                elif "dataset already exists" in error_msg.lower():
                    return {
                        'success': False,
                        'message': f"Pool {pool_name} already exists or name conflicts with existing dataset"
                    }
                else:
                    return {
                        'success': False,
                        'message': f"Error creating pool: {error_msg}"
                    }
                
        except Exception as e:
            logger.error(f"Exception creating pool: {e}")
            return {
                'success': False,
                'message': f"Exception creating pool: {str(e)}"
            }

    def get_available_disks(self) -> List[Dict]:
        """Get list of available disks that can be used for pool creation - EXCLUDING disks already in ZFS pools"""
        try:
            # Get all disks using lsblk
            returncode, stdout, stderr = self.execute_command(
                "sudo lsblk -J -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,LABEL,MODEL 2>/dev/null || sudo lsblk -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,LABEL,MODEL 2>/dev/null"
            )
            
            available_disks = []
            
            if returncode == 0:
                # Try to parse as JSON first
                if stdout.strip().startswith('{'):
                    try:
                        disk_data = json.loads(stdout)
                        if 'blockdevices' in disk_data:
                            for device in disk_data['blockdevices']:
                                if self._is_disk_available(device):
                                    device_path = f"/dev/{device['name']}"
                                    # Additional check: verify disk is not already in a ZFS pool
                                    if not self._is_disk_in_zfs_pool(device_path):
                                        available_disks.append({
                                            'name': device['name'],
                                            'path': device_path,
                                            'size': device['size'],
                                            'model': device.get('model', 'Unknown')
                                        })
                    except json.JSONDecodeError:
                        # Fallback to text parsing if JSON fails
                        available_disks = self._parse_lsblk_text(stdout)
                else:
                    # Parse text output
                    available_disks = self._parse_lsblk_text(stdout)
            
            return available_disks
            
        except Exception as e:
            logger.error(f"Error getting available disks: {e}")
            return []

    def _is_disk_in_zfs_pool(self, device_path: str) -> bool:
        """Check if a disk is already part of any ZFS pool"""
        try:
            # Method 1: Check zpool status for the device (most reliable)
            returncode, stdout, stderr = self.execute_command(f"sudo zpool status | grep -w {device_path}")
            if returncode == 0 and stdout.strip():
                logger.info(f"Disk {device_path} found in zpool status")
                return True

            # Method 2: Check zpool list for all pools and their devices
            pools = self.list_pools()
            for pool in pools:
                returncode, stdout, stderr = self.execute_command(f"sudo zpool status {pool['name']} | grep -w {device_path}")
                if returncode == 0 and stdout.strip():
                    logger.info(f"Disk {device_path} found in pool {pool['name']}")
                    return True

            # Method 3: Check if lsblk shows it as ZFS member (no blkid needed)
            returncode, stdout, stderr = self.execute_command(f"sudo lsblk -o FSTYPE {device_path} 2>/dev/null")
            if returncode == 0 and "zfs_member" in stdout:
                logger.info(f"Disk {device_path} has ZFS filesystem")
                return True

            # Method 4: Check for ZFS labels using zdb (more thorough check)
            returncode, stdout, stderr = self.execute_command(f"sudo zdb -l {device_path} 2>/dev/null | head -5")
            if returncode == 0 and ("name:" in stdout or "pool_guid:" in stdout):
                logger.info(f"Disk {device_path} has ZFS labels")
                return True

            return False

        except Exception as e:
            logger.warning(f"Error checking if disk {device_path} is in ZFS pool: {e}")
            return False

    def _is_disk_available(self, device: Dict) -> bool:
        """Check if a disk is available for ZFS pool creation"""
        # Basic availability checks
        if not (device['type'] == 'disk' and
                not device.get('mountpoint') and
                not device['name'].startswith('loop')):
            return False

        # Check filesystem type - exclude ZFS members and swap
        fstype = device.get('fstype', '')
        if fstype in ['zfs_member', 'swap']:
            return False

        # Check if it's a zvol (ZFS volume) - names starting with zd
        if device['name'].startswith('zd'):
            return False

        # Check if it's a floppy disk or other removable media
        if device['name'].startswith('fd'):
            return False

        # Additional check: ensure disk size is reasonable (> 1GB)
        try:
            size_str = device.get('size', '0')
            # Convert size to bytes for comparison
            if size_str.endswith('G'):
                size_gb = float(size_str[:-1])
                if size_gb < 1.0:
                    return False
            elif size_str.endswith('T'):
                size_tb = float(size_str[:-1])
                if size_tb < 0.001:  # Less than 1GB
                    return False
        except (ValueError, TypeError):
            # If we can't parse size, be conservative and exclude
            return False

        return True

    def _parse_lsblk_text(self, output: str) -> List[Dict]:
        """Parse lsblk text output - EXCLUDING disks already in ZFS pools"""
        available_disks = []
        lines = output.strip().split('\n')

        # Skip header line if present
        start_index = 1 if lines[0].startswith('NAME') else 0

        for line in lines[start_index:]:
            if line.strip():
                parts = line.split()
                if len(parts) >= 6:
                    disk_name = parts[0]
                    disk_size = parts[1]
                    disk_type = parts[2]
                    mountpoint = parts[3] if len(parts) > 3 else ''
                    fstype = parts[4] if len(parts) > 4 else ''

                    # Only include disks (not partitions) that are not mounted and not in use
                    if (disk_type == 'disk' and
                        not mountpoint and
                        fstype not in ['zfs_member', 'swap'] and
                        not disk_name.startswith('loop') and
                        not disk_name.startswith('zd') and
                        not disk_name.startswith('fd')):

                        # Get full device path
                        device_path = f"/dev/{disk_name}"

                        # Additional check: verify disk is not already in a ZFS pool
                        if not self._is_disk_in_zfs_pool(device_path):
                            model = ' '.join(parts[5:]) if len(parts) > 5 else 'Unknown'

                            # Additional size check (> 1GB)
                            try:
                                if disk_size.endswith('G'):
                                    size_gb = float(disk_size[:-1])
                                    if size_gb >= 1.0:
                                        available_disks.append({
                                            'name': disk_name,
                                            'path': device_path,
                                            'size': disk_size,
                                            'model': model
                                        })
                                elif disk_size.endswith('T'):
                                    # Accept any terabyte disk
                                    available_disks.append({
                                        'name': disk_name,
                                        'path': device_path,
                                        'size': disk_size,
                                        'model': model
                                    })
                            except (ValueError, TypeError):
                                # If we can't parse size, exclude the disk
                                continue

        return available_disks

    def get_compression_algorithms(self) -> List[str]:
        """Get available ZFS compression algorithms"""
        return [
            'off',
            'lz4',
            'gzip',
            'zstd',
            'lzjb',
            'zle'
        ]

    def destroy_pool(self, pool_name: str) -> Dict:
        """Destroy a ZFS pool and wipe ZFS metadata from disks"""
        try:
            # Check if pool exists
            returncode, stdout, stderr = self.execute_command(f"sudo zpool list -H {pool_name} 2>/dev/null")
            if returncode != 0:
                return {
                    'success': False,
                    'message': f"Pool {pool_name} does not exist"
                }

            # Get the physical disks used by the pool BEFORE destroying it
            disks_to_wipe = self._get_pool_physical_disks(pool_name)
            logger.info(f"Found physical disks for pool {pool_name}: {disks_to_wipe}")

            # If no disks found, try alternative method
            if not disks_to_wipe:
                disks_to_wipe = self._get_disks_from_pool_config(pool_name)
                logger.info(f"Found disks from alternative method: {disks_to_wipe}")

            # Destroy the pool
            returncode, stdout, stderr = self.execute_command(f"sudo zpool destroy {pool_name}")

            if returncode == 0:
                # Wipe ZFS metadata from all physical disks
                wipe_success = []
                wipe_failed = []

                for disk in disks_to_wipe:
                    try:
                        logger.info(f"Wiping ZFS metadata from {disk}")

                        # Method 1: Use wipefs to remove ALL filesystem signatures
                        wipefs_cmd = f"sudo wipefs -a {disk}"
                        returncode1, stdout1, stderr1 = self.execute_command(wipefs_cmd)

                        if returncode1 == 0:
                            logger.info(f"Successfully wiped filesystem signatures from {disk}")
                            wipe_success.append(disk)
                        else:
                            logger.warning(f"wipefs failed for {disk}: {stderr1}")
                            wipe_failed.append(disk)
                            continue

                        # Method 2: Use dd to overwrite ZFS labels (backup method)
                        dd_cmd = f"sudo dd if=/dev/zero of={disk} bs=1M count=1 2>/dev/null"
                        returncode2, stdout2, stderr2 = self.execute_command(dd_cmd)
                        if returncode2 == 0:
                            logger.info(f"Successfully overwrote first 1MB on {disk}")
                        else:
                            logger.warning(f"dd backup method failed for {disk}: {stderr2}")

                        # Method 3: Additional ZFS label wiping (more thorough)
                        # Overwrite the first few MB where ZFS labels are stored
                        for offset in [0, 8, 16, 24, 32]:  # ZFS label locations in MB
                            dd_label_cmd = f"sudo dd if=/dev/zero of={disk} bs=1M seek={offset} count=1 2>/dev/null"
                            self.execute_command(dd_label_cmd)

                    except Exception as e:
                        logger.error(f"Error wiping ZFS metadata from {disk}: {e}")
                        wipe_failed.append(disk)

                message = f"Pool {pool_name} destroyed successfully"
                if wipe_success:
                    message += f" and ZFS metadata wiped from {len(wipe_success)} disk(s)"
                if wipe_failed:
                    message += f" (failed to wipe {len(wipe_failed)} disk(s))"

                return {
                    'success': True,
                    'message': message,
                    'wiped_disks': wipe_success,
                    'failed_disks': wipe_failed
                }
            else:
                return {
                    'success': False,
                    'message': f"Error destroying pool: {stderr}"
                }

        except Exception as e:
            logger.error(f"Exception destroying pool: {e}")
            return {
                'success': False,
                'message': f"Exception destroying pool: {str(e)}"
            }

    def _get_pool_physical_disks(self, pool_name: str) -> List[str]:
        """Get physical disks used by a ZFS pool (not partitions)"""
        physical_disks = set()
        try:
            # Get detailed pool status
            returncode, stdout, stderr = self.execute_command(f"sudo zpool status -v {pool_name}")
            if returncode == 0:
                lines = stdout.strip().split('\n')
                in_config_section = False
                
                for line in lines:
                    line = line.strip()
                    
                    # Look for the configuration section
                    if line.startswith('config:'):
                        in_config_section = True
                        continue
                    
                    if in_config_section:
                        # Skip header lines and separators
                        if line.startswith('NAME') or line.startswith('---') or not line:
                            continue
                        
                        # Stop when we reach the end of the configuration section
                        if line.startswith('errors:'):
                            break
                        
                        # Extract device path from the line
                        parts = line.split()
                        if parts:
                            device_path = parts[0]
                            if device_path.startswith('/dev/'):
                                # Extract physical disk from device path
                                physical_disk = self._get_physical_disk(device_path)
                                if physical_disk:
                                    physical_disks.add(physical_disk)
                                    logger.info(f"Found device: {device_path} -> physical disk: {physical_disk}")
            
            # Alternative method: Check what disks were used when creating the pool
            # by looking at the pool's vdev configuration
            returncode, stdout, stderr = self.execute_command(f"sudo zdb -C {pool_name} 2>/dev/null")
            if returncode == 0:
                lines = stdout.strip().split('\n')
                for line in lines:
                    if 'path' in line and '/dev/' in line:
                        # Extract device path from zdb output
                        match = re.search(r'/dev/[^\s,\']+', line)
                        if match:
                            device_path = match.group(0)
                            physical_disk = self._get_physical_disk(device_path)
                            if physical_disk:
                                physical_disks.add(physical_disk)
                                logger.info(f"Found device from zdb: {device_path} -> physical disk: {physical_disk}")
            
            # Final fallback: Try to get disks from zpool list with more verbose output
            if not physical_disks:
                returncode, stdout, stderr = self.execute_command(f"sudo zpool list -v {pool_name}")
                if returncode == 0:
                    lines = stdout.strip().split('\n')
                    for line in lines:
                        line = line.strip()
                        if line.startswith('/dev/'):
                            device_path = line.split()[0]
                            physical_disk = self._get_physical_disk(device_path)
                            if physical_disk:
                                physical_disks.add(physical_disk)
                                logger.info(f"Found device from zpool list: {device_path} -> physical disk: {physical_disk}")
            
            # Convert set to sorted list
            physical_disks = sorted(list(physical_disks))
            logger.info(f"Final physical disks for pool {pool_name}: {physical_disks}")
            
        except Exception as e:
            logger.warning(f"Error getting pool physical disks: {e}")
        
        return physical_disks

    def _get_disks_from_pool_config(self, pool_name: str) -> List[str]:
        """Alternative method to get disks from pool configuration"""
        disks = set()
        try:
            # Method 1: zdb - read pool configuration
            returncode, stdout, stderr = self.execute_command(f"sudo zdb -C {pool_name} 2>/dev/null")
            if returncode == 0:
                lines = stdout.strip().split('\n')
                for line in lines:
                    if 'path' in line and '/dev/' in line:
                        match = re.search(r'/dev/[^\s,\']+', line)
                        if match:
                            disk_path = match.group(0)
                            # Convert to physical disk
                            physical_disk = self._get_physical_disk(disk_path)
                            if physical_disk:
                                disks.add(physical_disk)
            
            # Method 2: zpool status -v
            returncode, stdout, stderr = self.execute_command(f"sudo zpool status -v {pool_name}")
            if returncode == 0:
                lines = stdout.strip().split('\n')
                for line in lines:
                    if '/dev/' in line:
                        parts = line.split()
                        for part in parts:
                            if part.startswith('/dev/'):
                                physical_disk = self._get_physical_disk(part)
                                if physical_disk:
                                    disks.add(physical_disk)
            
            return sorted(list(disks))
            
        except Exception as e:
            logger.error(f"Error getting disks from pool config: {e}")
            return []

    def _get_physical_disk(self, device_path: str) -> str:
        """Extract physical disk from device path"""
        try:
            # Handle different device types
            
            # SATA/SCSI/SAS disks: /dev/sda1 -> /dev/sda
            if re.match(r'^/dev/sd[a-z]+[0-9]*$', device_path):
                return re.sub(r'[0-9]+$', '', device_path)
            
            # NVMe disks: /dev/nvme0n1p1 -> /dev/nvme0n1
            elif re.match(r'^/dev/nvme[0-9]+n[0-9]+p[0-9]+$', device_path):
                return re.sub(r'p[0-9]+$', '', device_path)
            
            # NVMe disks without partition: /dev/nvme0n1 -> /dev/nvme0n1
            elif re.match(r'^/dev/nvme[0-9]+n[0-9]+$', device_path):
                return device_path
            
            # IDE disks: /dev/hda1 -> /dev/hda
            elif re.match(r'^/dev/hd[a-z]+[0-9]*$', device_path):
                return re.sub(r'[0-9]+$', '', device_path)
            
            # Virtio disks: /dev/vda1 -> /dev/vda
            elif re.match(r'^/dev/vd[a-z]+[0-9]*$', device_path):
                return re.sub(r'[0-9]+$', '', device_path)
            
            # If it's already a physical disk, return as is
            elif re.match(r'^/dev/(sd[a-z]+|nvme[0-9]+n[0-9]+|hd[a-z]+|vd[a-z]+)$', device_path):
                return device_path
            
            # Unknown format, try basic cleanup
            else:
                # Remove trailing numbers (common for partitions)
                cleaned = re.sub(r'[0-9]+$', '', device_path)
                if cleaned != device_path:
                    return cleaned
                return device_path
                
        except Exception as e:
            logger.warning(f"Error extracting physical disk from {device_path}: {e}")
            return device_path

    def list_datasets(self, pool_name: str = None) -> List[Dict]:
        """List ZFS datasets and volumes with enhanced volume information"""
        if pool_name:
            returncode, stdout, stderr = self.execute_command(f"sudo zfs list -r -o name,used,avail,refer,mountpoint,type -H {pool_name}")
        else:
            returncode, stdout, stderr = self.execute_command("sudo zfs list -r -o name,used,avail,refer,mountpoint,type -H")
        
        datasets = []
        if returncode == 0:
            for line in stdout.strip().split('\n'):
                if line:
                    parts = line.split('\t')
                    if len(parts) >= 6:
                        dataset_info = {
                            'name': parts[0],
                            'used': parts[1],
                            'available': parts[2],
                            'referenced': parts[3],
                            'mountpoint': parts[4],
                            'type': parts[5]
                        }
                        
                        # For volumes, get the actual volsize for better accuracy
                        if parts[5] == 'volume':
                            volsize_info = self._get_volume_size(parts[0])
                            if volsize_info:
                                dataset_info['volsize'] = volsize_info
                        
                        datasets.append(dataset_info)
        return datasets
    
    def _get_volume_size(self, volume_name: str) -> str:
        """Get the actual volume size for a ZFS volume"""
        try:
            returncode, stdout, stderr = self.execute_command(f"sudo zfs get volsize -H -o value {volume_name}")
            if returncode == 0 and stdout.strip():
                return stdout.strip()
        except Exception as e:
            logger.warning(f"Failed to get volsize for {volume_name}: {e}")
        return None
    
    def get_available_zvols(self, pool_name: str = None) -> List[Dict]:
        """Get available ZFS volumes that are not configured in iSCSI"""
        try:
            from iscsi_backend import ISCSIBackend
        except ImportError:
            # Fallback if iscsi_backend is not available
            configured_volumes = []
        else:
            configured_targets = ISCSIBackend().get_targets()
            configured_volumes = []
            
            for target in configured_targets:
                for lun in target.get('luns', []):
                    backstore = lun.get('backstore', '')
                    if backstore and backstore != 'unknown':
                        configured_volumes.append(backstore)
        
        all_datasets = self.list_datasets(pool_name)
        volumes = [ds for ds in all_datasets if ds['type'] == 'volume']
        
        available_volumes = []
        for volume in volumes:
            vol_name = volume['name'].split('/')[-1]
            if vol_name not in configured_volumes:
                # Add the device path to the volume info
                volume['device_path'] = f"/dev/zvol/{volume['name']}"
                available_volumes.append(volume)
        
        return available_volumes
    
    def create_zvol(self, name: str, size: str, pool: str = None, compression: str = None) -> Dict:
        """Create a ZFS volume with optional compression"""
        # Use provided pool or get the first available pool
        if not pool:
            pool = self.get_default_pool()
        
        volname = f"{pool}/{name}"
        
        # Check if pool exists
        pools = self.list_pools()
        pool_names = [p['name'] for p in pools]
        if pool not in pool_names:
            return {
                'success': False,
                'message': f"Pool '{pool}' does not exist. Available pools: {', '.join(pool_names) if pool_names else 'No pools available'}"
            }
        
        # Check if volume already exists
        returncode, stdout, stderr = self.execute_command(f"sudo zfs list -H {volname} 2>/dev/null")
        if returncode == 0:
            return {
                'success': False,
                'message': f"Volume {volname} already exists"
            }
        
        # Build create command
        create_cmd = f"sudo zfs create -V {size} {volname}"
        returncode, stdout, stderr = self.execute_command(create_cmd)
        
        if returncode == 0:
            # Set compression if specified
            if compression and compression != 'off':
                comp_cmd = f"sudo zfs set compression={compression} {volname}"
                comp_returncode, comp_stdout, comp_stderr = self.execute_command(comp_cmd)
                if comp_returncode != 0:
                    logger.warning(f"Failed to set compression on volume: {comp_stderr}")

            # Disable refreservation to prevent space reservation issues
            refreservation_cmd = f"sudo zfs set refreservation=none {volname}"
            refreservation_returncode, refreservation_stdout, refreservation_stderr = self.execute_command(refreservation_cmd)
            if refreservation_returncode != 0:
                logger.warning(f"Failed to disable refreservation on volume: {refreservation_stderr}")

            # Verify the device was created
            device_check = self.execute_command(f"sudo ls /dev/zvol/{volname}")
            if device_check[0] != 0:
                return {
                    'success': False,
                    'message': f"Volume created but device path /dev/zvol/{volname} not found"
                }

            return {
                'success': True,
                'message': f"Volume {volname} created successfully" +
                          (f" with {compression} compression" if compression and compression != 'off' else ""),
                'volume_path': f"/dev/zvol/{volname}"
            }
        else:
            error_msg = stderr.strip()
            if "no such pool" in error_msg.lower():
                return {
                    'success': False,
                    'message': f"Pool '{pool}' does not exist. Available pools: {', '.join(pool_names) if pool_names else 'No pools available'}"
                }
            else:
                return {
                    'success': False,
                    'message': f"Error creating volume: {error_msg}"
                }
    
    def create_dataset(self, name: str, pool: str = None, quota: str = None, compression: str = None) -> Dict:
        """Create a ZFS dataset with optional compression"""
        # Use provided pool or get the first available pool
        if not pool:
            pool = self.get_default_pool()
            
        dataset_name = f"{pool}/{name}"
        
        # Check if pool exists
        pools = self.list_pools()
        pool_names = [p['name'] for p in pools]
        if pool not in pool_names:
            return {
                'success': False,
                'message': f"Pool '{pool}' does not exist. Available pools: {', '.join(pool_names) if pool_names else 'No pools available'}"
            }
        
        # Check if dataset already exists
        returncode, stdout, stderr = self.execute_command(f"sudo zfs list -H {dataset_name} 2>/dev/null")
        if returncode == 0:
            return {
                'success': False,
                'message': f"Dataset {dataset_name} already exists"
            }
        
        # Build create command
        cmd = f"sudo zfs create {dataset_name}"
        if quota:
            cmd += f" && sudo zfs set quota={quota} {dataset_name}"
        if compression and compression != 'off':
            cmd += f" && sudo zfs set compression={compression} {dataset_name}"
            
        returncode, stdout, stderr = self.execute_command(cmd)
        
        if returncode == 0:
            return {
                'success': True,
                'message': f"Dataset {dataset_name} created successfully" + 
                          (f" with {compression} compression" if compression and compression != 'off' else "")
            }
        else:
            error_msg = stderr.strip()
            if "no such pool" in error_msg.lower():
                return {
                    'success': False,
                    'message': f"Pool '{pool}' does not exist. Available pools: {', '.join(pool_names) if pool_names else 'No pools available'}"
                }
            else:
                return {
                    'success': False,
                    'message': f"Error creating dataset: {error_msg}"
                }
    
    def delete_zvol(self, name: str, pool: str = None) -> Dict:
        """Delete a ZFS volume"""
        # Use provided pool or get the first available pool
        if not pool:
            pool = self.get_default_pool()

        volname = f"{pool}/{name}"

        # Check if volume is configured in iSCSI targets
        try:
            from iscsi_backend import ISCSIBackend
            iscsi_backend = ISCSIBackend()
            targets = iscsi_backend.get_targets()

            for target in targets:
                for lun in target.get('luns', []):
                    backstore = lun.get('backstore', '')
                    if backstore == name:
                        return {
                            'success': False,
                            'message': f"Cannot delete volume '{volname}': it is currently configured as an iSCSI LUN in target '{target['iqn']}'. Please remove the iSCSI target first before deleting the volume."
                        }
        except ImportError:
            logger.warning("iSCSI backend not available for volume usage check")
        except Exception as e:
            logger.warning(f"Error checking iSCSI usage for volume {volname}: {e}")

        returncode, stdout, stderr = self.execute_command(f"sudo zfs destroy {volname}")
        return {
            'success': returncode == 0,
            'message': f"Volume {volname} deleted successfully" if returncode == 0 else f"Error: {stderr}"
        }
    
    def delete_dataset(self, name: str, pool: str = None) -> Dict:
        """Delete a ZFS dataset"""
        # Use provided pool or get the first available pool
        if not pool:
            pool = self.get_default_pool()

        dataset_name = f"{pool}/{name}"

        # Check if dataset is configured as a Samba share
        try:
            from samba_manager import SambaManager
            samba_manager = SambaManager()
            shares = samba_manager.get_all_shares()

            for share in shares:
                share_path = share.get('path', '')
                # Check if the share path matches the dataset path
                if share_path == f"/{dataset_name}" or share_path.startswith(f"/{dataset_name}/"):
                    return {
                        'success': False,
                        'message': f"Cannot delete dataset '{dataset_name}': it is currently configured as a Samba share '{share['name']}'. Please remove the Samba share first before deleting the dataset."
                    }
        except ImportError:
            logger.warning("Samba manager not available for dataset usage check")
        except Exception as e:
            logger.warning(f"Error checking Samba usage for dataset {dataset_name}: {e}")

        returncode, stdout, stderr = self.execute_command(f"sudo zfs destroy {dataset_name}")
        return {
            'success': returncode == 0,
            'message': f"Dataset {dataset_name} deleted successfully" if returncode == 0 else f"Error: {stderr}"
        }
    
    def resize_zvol(self, name: str, new_size: str, pool: str = None) -> Dict:
        """Resize a ZFS volume"""
        # Use provided pool or get the first available pool
        if not pool:
            pool = self.get_default_pool()
            
        volname = f"{pool}/{name}"
        returncode, stdout, stderr = self.execute_command(f"sudo zfs set volsize={new_size} {volname}")
        return {
            'success': returncode == 0,
            'message': f"Volume {volname} resized to {new_size}" if returncode == 0 else f"Error: {stderr}"
        }
    
    def resize_dataset(self, name: str, new_quota: str, pool: str = None) -> Dict:
        """Resize a ZFS dataset quota"""
        # Use provided pool or get the first available pool
        if not pool:
            pool = self.get_default_pool()
            
        dataset_name = f"{pool}/{name}"
        returncode, stdout, stderr = self.execute_command(f"sudo zfs set quota={new_quota} {dataset_name}")
        return {
            'success': returncode == 0,
            'message': f"Dataset {dataset_name} quota set to {new_quota}" if returncode == 0 else f"Error: {stderr}"
        }
    
    def create_snapshot(self, dataset: str, snapshot_name: str) -> Dict:
        """Create a ZFS snapshot"""
        snapshot_full = f"{dataset}@{snapshot_name}"
        returncode, stdout, stderr = self.execute_command(f"sudo zfs snapshot {snapshot_full}")
        return {
            'success': returncode == 0,
            'message': f"Snapshot {snapshot_full} created successfully" if returncode == 0 else f"Error: {stderr}"
        }
    
    def list_snapshots(self, dataset: str = None) -> List[Dict]:
        """List ZFS snapshots"""
        if dataset:
            target = dataset
        else:
            target = "-r -t snapshot"
        
        returncode, stdout, stderr = self.execute_command(f"sudo zfs list -o name,creation,used,refer -H {target}")
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
        return snapshots
    
    def delete_snapshot(self, snapshot_name: str) -> Dict:
        """Delete a ZFS snapshot"""
        logger.info(f"Deleting snapshot: {snapshot_name}")
        
        # First, let's verify the snapshot exists
        check_cmd = f"sudo zfs list -H -o name {snapshot_name}"
        returncode, stdout, stderr = self.execute_command(check_cmd)
        
        if returncode != 0:
            return {
                'success': False,
                'message': f"Snapshot does not exist: {snapshot_name}. Error: {stderr}"
            }
        
        # Now try to delete the snapshot
        delete_cmd = f"sudo zfs destroy {snapshot_name}"
        returncode, stdout, stderr = self.execute_command(delete_cmd)
        
        if returncode == 0:
            return {
                'success': True,
                'message': f"Snapshot {snapshot_name} deleted successfully"
            }
        else:
            error_msg = stderr.strip()
            # Check for specific error cases
            if "dataset is busy" in error_msg.lower():
                return {
                    'success': False,
                    'message': f"Cannot delete snapshot {snapshot_name}: dataset is busy. Try using 'zfs destroy -r' to force deletion."
                }
            elif "has dependent clones" in error_msg.lower():
                # Extract clone information from the error message
                clone_info = self._extract_clone_info(error_msg)
                return {
                    'success': False,
                    'message': f"Cannot delete snapshot {snapshot_name}: it has dependent clones.\n\nDependent clones:\n{clone_info}\n\nTo delete this snapshot, you must first:\n1. Delete the dependent clones listed above\n2. Or use the recursive destroy option (-R) which will delete both the snapshot and all its dependent clones"
                }
            else:
                return {
                    'success': False,
                    'message': f"Error deleting snapshot: {error_msg}"
                }

    def _extract_clone_info(self, error_msg: str) -> str:
        """Extract clone information from error message"""
        lines = error_msg.strip().split('\n')
        clone_info = []
        in_clone_list = False
        
        for line in lines:
            line = line.strip()
            if "clones" in line.lower() or "dependent" in line.lower():
                in_clone_list = True
                continue
            if in_clone_list and line:
                # Skip empty lines and command suggestions
                if not line or line.startswith('use') or line.startswith('to'):
                    continue
                clone_info.append(f"  - {line}")
        
        if clone_info:
            return '\n'.join(clone_info)
        else:
            return "  (Unable to extract clone details from error message)"

    def clone_snapshot(self, snapshot_name: str, clone_name: str) -> Dict:
        """Clone a ZFS snapshot to a new dataset"""
        try:
            # Validate snapshot exists
            check_cmd = f"sudo zfs list -H -o name {snapshot_name}"
            returncode, stdout, stderr = self.execute_command(check_cmd)
            
            if returncode != 0:
                return {
                    'success': False,
                    'message': f"Snapshot does not exist: {snapshot_name}"
                }
            
            # Validate clone name doesn't exist
            check_clone_cmd = f"sudo zfs list -H -o name {clone_name} 2>/dev/null"
            returncode, stdout, stderr = self.execute_command(check_clone_cmd)
            
            if returncode == 0:
                return {
                    'success': False,
                    'message': f"Clone target already exists: {clone_name}"
                }
            
            # Create the clone
            clone_cmd = f"sudo zfs clone {snapshot_name} {clone_name}"
            returncode, stdout, stderr = self.execute_command(clone_cmd)
            
            if returncode == 0:
                return {
                    'success': True,
                    'message': f"Successfully cloned {snapshot_name} to {clone_name}"
                }
            else:
                error_msg = stderr.strip()
                if "destination already exists" in error_msg.lower():
                    return {
                        'success': False,
                        'message': f"Clone target already exists: {clone_name}"
                    }
                elif "missing dataset name" in error_msg.lower():
                    return {
                        'success': False,
                        'message': f"Invalid clone name format: {clone_name}. Please use format 'pool/dataset_name'"
                    }
                else:
                    return {
                        'success': False,
                        'message': f"Error creating clone: {error_msg}"
                    }
                    
        except Exception as e:
            logger.error(f"Exception cloning snapshot: {e}")
            return {
                'success': False,
                'message': f"Exception cloning snapshot: {str(e)}"
            }

    def rollback_snapshot(self, snapshot_name: str) -> Dict:
        """Rollback a ZFS dataset to a snapshot"""
        # Extract dataset name from snapshot name (remove @snapshot part)
        dataset_name = snapshot_name.split('@')[0]

        # Check if there are any intermediate snapshots that would be destroyed
        check_cmd = f"sudo zfs list -H -o name -t snapshot -r {dataset_name} | grep {dataset_name}"
        returncode, stdout, stderr = self.execute_command(check_cmd)

        if returncode == 0:
            snapshots = stdout.strip().split('\n')
            target_index = -1
            for i, snap in enumerate(snapshots):
                if snap == snapshot_name:
                    target_index = i
                    break

            # If there are newer snapshots, warn the user
            if target_index < len(snapshots) - 1:
                newer_snapshots = snapshots[target_index + 1:]
                return {
                    'success': False,
                    'message': f"Cannot rollback to {snapshot_name}: there are newer snapshots that would be destroyed.\n\nNewer snapshots:\n" +
                               "\n".join(newer_snapshots) +
                               "\n\nTo proceed, you must first delete these newer snapshots or use the force (-r) option."
                }

        # Perform the rollback
        returncode, stdout, stderr = self.execute_command(f"sudo zfs rollback {snapshot_name}")
        return {
            'success': returncode == 0,
            'message': f"Rollback to {snapshot_name} completed successfully" if returncode == 0 else f"Error: {stderr}"
        }

    def list_importable_pools(self) -> List[Dict]:
        """List ZFS pools that can be imported"""
        try:
            # Use zpool import to list available pools
            returncode, stdout, stderr = self.execute_command("sudo zpool import -d /dev/disk/by-id 2>/dev/null")

            if returncode != 0:
                # Try without -d option as fallback
                returncode, stdout, stderr = self.execute_command("sudo zpool import 2>/dev/null")

            importable_pools = []

            if returncode == 0:
                lines = stdout.strip().split('\n')
                current_pool = None

                for line in lines:
                    line = line.strip()
                    if line.startswith('pool:'):
                        # Extract pool name
                        pool_match = re.search(r'pool:\s+(\S+)', line)
                        if pool_match:
                            pool_name = pool_match.group(1)
                            current_pool = {
                                'name': pool_name,
                                'id': '',
                                'state': '',
                                'status': '',
                                'action': '',
                                'see': ''
                            }
                            importable_pools.append(current_pool)
                    elif current_pool and line.startswith('id:'):
                        # Extract pool ID
                        id_match = re.search(r'id:\s+(\S+)', line)
                        if id_match:
                            current_pool['id'] = id_match.group(1)
                    elif current_pool and line.startswith('state:'):
                        # Extract pool state
                        state_match = re.search(r'state:\s+(\S+)', line)
                        if state_match:
                            current_pool['state'] = state_match.group(1)
                    elif current_pool and line.startswith('status:'):
                        # Extract status
                        status_match = re.search(r'status:\s+(.+)', line)
                        if status_match:
                            current_pool['status'] = status_match.group(1).strip()
                    elif current_pool and line.startswith('action:'):
                        # Extract action
                        action_match = re.search(r'action:\s+(.+)', line)
                        if action_match:
                            current_pool['action'] = action_match.group(1).strip()
                    elif current_pool and line.startswith('see:'):
                        # Extract see information
                        see_match = re.search(r'see:\s+(.+)', line)
                        if see_match:
                            current_pool['see'] = see_match.group(1).strip()

            # Filter out pools that are already imported
            imported_pools = self.list_pools()
            imported_names = [p['name'] for p in imported_pools]

            filtered_pools = [pool for pool in importable_pools if pool['name'] not in imported_names]

            return filtered_pools

        except Exception as e:
            logger.error(f"Error listing importable pools: {e}")
            return []

    def import_pool(self, pool_name: str, pool_id: str = None) -> Dict:
        """Import a ZFS pool"""
        try:
            # Check if pool is already imported
            imported_pools = self.list_pools()
            imported_names = [p['name'] for p in imported_pools]

            if pool_name in imported_names:
                return {
                    'success': False,
                    'message': f"Pool {pool_name} is already imported"
                }

            # Build import command
            if pool_id:
                import_cmd = f"sudo zpool import -d /dev/disk/by-id {pool_id}"
            else:
                import_cmd = f"sudo zpool import -d /dev/disk/by-id {pool_name}"

            logger.info(f"Importing pool with command: {import_cmd}")
            returncode, stdout, stderr = self.execute_command(import_cmd)

            if returncode == 0:
                return {
                    'success': True,
                    'message': f"Pool {pool_name} imported successfully"
                }
            else:
                error_msg = stderr.strip()
                if "no such pool" in error_msg.lower():
                    return {
                        'success': False,
                        'message': f"Pool {pool_name} not found or not available for import"
                    }
                elif "pool already exists" in error_msg.lower():
                    return {
                        'success': False,
                        'message': f"Pool {pool_name} is already imported"
                    }
                elif "permission denied" in error_msg.lower() or "sudo" in error_msg.lower():
                    return {
                        'success': False,
                        'message': "Permission denied: sudo access required. Please check sudoers configuration."
                    }
                else:
                    return {
                        'success': False,
                        'message': f"Error importing pool: {error_msg}"
                    }

        except Exception as e:
            logger.error(f"Exception importing pool: {e}")
            return {
                'success': False,
                'message': f"Exception importing pool: {str(e)}"
            }