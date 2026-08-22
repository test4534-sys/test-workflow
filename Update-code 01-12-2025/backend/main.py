#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os
import sys
import logging
from datetime import datetime

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configure logging with better formatting
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('zfs_manager.log', mode='a')
    ]
)
logger = logging.getLogger(__name__)

try:
    from iscsi_backend import ISCSIBackend
    from zfs_manager import ZFSManager
    from samba_manager import SambaManager
    from user_manager import UserManager
    from network_manager import NetworkManager
    from log_manager import LogManager
    from service_manager import ServiceManager
    from snapshot_backend import SnapshotBackend
    from login import AuthManager
    from system_info import SystemInfoManager
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure all manager files are in the same directory")
    sys.exit(1)

app = FastAPI(
    title="ZFS iSCSI Manager",
    version="2.0.0",
    description="Modern web interface for managing ZFS storage and iSCSI targets"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize managers with better error handling
managers = {}
try:
    managers['iscsi'] = ISCSIBackend()
    managers['zfs'] = ZFSManager()
    managers['samba'] = SambaManager()
    managers['user'] = UserManager()
    managers['network'] = NetworkManager()
    managers['log'] = LogManager()
    managers['service'] = ServiceManager()
    managers['snapshot'] = SnapshotBackend()
    managers['auth'] = AuthManager()
    managers['system_info'] = SystemInfoManager()

    # Assign to individual variables for backward compatibility
    iscsi_backend = managers['iscsi']
    zfs_manager = managers['zfs']
    samba_manager = managers['samba']
    user_manager = managers['user']
    network_manager = managers['network']
    log_manager = managers['log']
    service_manager = managers['service']
    snapshot_backend = managers['snapshot']
    auth_manager = managers['auth']
    system_info_manager = managers['system_info']

    logger.info("✓ All backend managers initialized successfully")
except Exception as e:
    logger.error(f"✗ Error initializing backend managers: {e}")
    sys.exit(1)

# Pydantic models
class LoginRequest(BaseModel):
    username: str
    password: str

class TargetCreate(BaseModel):
    name: str
    zvol_name: str
    pool_name: str = "tank"

class ACLCreate(BaseModel):
    target_iqn: str
    client_iqn: str

class ZvolCreate(BaseModel):
    name: str
    size: str
    pool: str = "tank"
    compression: Optional[str] = 'off'

class ZvolResize(BaseModel):
    name: str
    new_size: str
    pool: str = "tank"

class DatasetResize(BaseModel):
    name: str
    new_quota: str
    pool: str = "tank"

class SnapshotCreate(BaseModel):
    dataset: str
    snapshot_name: str

class SnapshotDelete(BaseModel):
    snapshot_name: str

class SnapshotRollback(BaseModel):
    snapshot_name: str

class SnapshotClone(BaseModel):
    snapshot_name: str
    clone_name: str

class SnapshotSchedule(BaseModel):
    dataset: str
    snapshot_name: str
    schedule_type: str
    hour: Optional[str] = '0'
    minute: Optional[str] = '0'
    day_of_week: Optional[str] = '*'
    day_of_month: Optional[str] = '*'
    month: Optional[str] = '*'
    retention_days: Optional[int] = 7

class DatasetCreate(BaseModel):
    name: str
    pool: str = "tank"
    quota: Optional[str] = None
    compression: Optional[str] = 'off'

class UserCreate(BaseModel):
    username: str
    full_name: str
    password: str
    groups: List[str] = []
    enable_samba: bool = True

class GroupCreate(BaseModel):
    name: str

class SambaShareCreate(BaseModel):
    name: str
    path: str
    browseable: bool = True
    writable: bool = True
    valid_users: Optional[str] = None
    force_group: Optional[str] = None
    audit_enabled: bool = False

class SambaConfig(BaseModel):
    workgroup: str
    server_string: str
    netbios_name: str

class SambaPassword(BaseModel):
    password: str

class AddUserToGroup(BaseModel):
    username: str

class RemoveUserFromGroup(BaseModel):
    username: str

class UserUpdate(BaseModel):
    full_name: str
    password: str
    groups: List[str] = []

# Pool creation models
class PoolCreate(BaseModel):
    name: str
    devices: List[str]
    mountpoint: Optional[str] = None
    compression: Optional[str] = 'off'

class PoolDelete(BaseModel):
    name: str

class PoolImport(BaseModel):
    name: str
    pool_id: Optional[str] = None

# Authentication endpoints
@app.post("/api/auth/login")
async def login(login_data: LoginRequest):
    """Authenticate user and return JWT token"""
    try:
        result = auth_manager.authenticate_user(login_data.username, login_data.password)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Login failed: {str(e)}"
        }

@app.post("/api/auth/verify")
async def verify_token(request: Request):
    """Verify JWT token"""
    try:
        # Get raw body as string
        body = await request.body()
        token = body.decode('utf-8').strip('"')  # Remove quotes if present

        user_info = auth_manager.verify_token(token)
        if user_info:
            return {
                'success': True,
                'user': user_info
            }
        else:
            return {
                'success': False,
                'message': 'Invalid or expired token'
            }
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        return {
            'success': False,
            'message': 'Token verification failed'
        }

@app.post("/api/auth/refresh")
async def refresh_token(token: str):
    """Refresh JWT token"""
    try:
        new_token = auth_manager.refresh_token(token)
        if new_token:
            return {
                'success': True,
                'token': new_token
            }
        else:
            return {
                'success': False,
                'message': 'Token refresh failed'
            }
    except Exception as e:
        return {
            'success': False,
            'message': f"Token refresh failed: {str(e)}"
        }

# Root endpoint
@app.get("/")
async def root():
    return {"message": "ZFS iSCSI Manager API", "status": "running"}

# Health check endpoint with improved error handling
@app.get("/health")
async def health_check():
    health_data = {
        "status": "healthy",
        "pools_count": 0,
        "targets_count": 0,
        "samba_status": {"success": False, "services": {}},
        "sudo_access": False,
        "timestamp": datetime.now().isoformat(),
        "services": {}
    }

    try:
        # Check each manager individually to provide granular health status
        try:
            pools = zfs_manager.list_pools()
            health_data["pools_count"] = len(pools)
            health_data["services"]["zfs"] = "healthy"
        except Exception as e:
            logger.warning(f"ZFS manager health check failed: {e}")
            health_data["services"]["zfs"] = f"error: {str(e)}"

        try:
            targets = iscsi_backend.get_targets()
            health_data["targets_count"] = len(targets)
            health_data["services"]["iscsi"] = "healthy"
        except Exception as e:
            logger.warning(f"iSCSI backend health check failed: {e}")
            health_data["services"]["iscsi"] = f"error: {str(e)}"

        try:
            samba_status = samba_manager.get_samba_service_status()
            health_data["samba_status"] = samba_status
            health_data["services"]["samba"] = "healthy" if samba_status.get("success") else "error"
        except Exception as e:
            logger.warning(f"Samba manager health check failed: {e}")
            health_data["services"]["samba"] = f"error: {str(e)}"

        # Check if we have sudo access
        try:
            sudo_check = zfs_manager.execute_command("sudo -n zpool list 2>&1")
            health_data["sudo_access"] = sudo_check[0] == 0
            health_data["services"]["sudo"] = "available" if health_data["sudo_access"] else "unavailable"
        except Exception as e:
            logger.warning(f"Sudo access check failed: {e}")
            health_data["services"]["sudo"] = f"error: {str(e)}"

        # Determine overall status
        if any("error" in str(status) for status in health_data["services"].values()):
            health_data["status"] = "degraded"

        return health_data
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        health_data["status"] = "unhealthy"
        health_data["error"] = str(e)
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

# Dashboard endpoints with improved error handling
@app.get("/api/system/status")
async def get_system_status():
    status_data = {
        "iscsi": {"overall": "unknown", "targets": []},
        "zfs": {"pools": []},
        "samba": {"services": {"overall": "unknown"}}
    }

    try:
        # Get iSCSI status with fallback
        try:
            iscsi_status = iscsi_backend.get_system_status()
            status_data["iscsi"] = iscsi_status
        except Exception as e:
            logger.warning(f"Failed to get iSCSI status: {e}")
            status_data["iscsi"]["error"] = str(e)

        # Get ZFS status with fallback
        try:
            zfs_status = zfs_manager.get_pool_status()
            status_data["zfs"] = zfs_status
        except Exception as e:
            logger.warning(f"Failed to get ZFS status: {e}")
            status_data["zfs"]["error"] = str(e)

        # Get Samba status with fallback
        try:
            samba_status = samba_manager.get_samba_service_status()
            status_data["samba"] = samba_status
        except Exception as e:
            logger.warning(f"Failed to get Samba status: {e}")
            status_data["samba"]["error"] = str(e)

        return status_data
    except Exception as e:
        logger.error(f"Failed to get system status: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get system status: {str(e)}")

# Network endpoints
@app.get("/api/network/interfaces")
async def get_network_interfaces():
    try:
        interfaces = network_manager.get_network_interfaces()
        return interfaces
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get network interfaces: {str(e)}")

# System logs endpoints
@app.get("/api/system/logs")
async def get_system_logs(limit: int = 20, service: str = None, search: str = None):
    try:
        logs = log_manager.get_system_logs(limit, service, search)
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system logs: {str(e)}")

# System information endpoint
@app.get("/api/system/basic-info")
async def get_system_basic_info():
    """Get basic system information: hostname, kernel version, date/time, timezone, uptime"""
    try:
        result = system_info_manager.get_system_info()
        if not result.get('success'):
            raise HTTPException(status_code=500, detail=result.get('error', 'Failed to get system info'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting system basic info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get system info: {str(e)}")

# Disk information endpoint
@app.get("/api/system/disks")
async def get_system_disks():
    """Get disk information from the system using lsblk and df commands"""
    try:
        import subprocess
        import json
        
        # Get disk information using lsblk in JSON format with partition information
        lsblk_data = {}
        try:
            result = subprocess.run(['lsblk', '-J', '-b', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,MODEL,SERIAL,FSTYPE'], 
                                  capture_output=True, text=True, check=True, timeout=10)
            lsblk_data = json.loads(result.stdout)
            logger.info("Successfully got lsblk data in JSON format")
        except (subprocess.CalledProcessError, json.JSONDecodeError, subprocess.TimeoutExpired) as e:
            logger.warning(f"lsblk JSON failed, trying fallback: {e}")
            # Fallback to basic lsblk if JSON fails
            result = subprocess.run(['lsblk', '-b', '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,MODEL,SERIAL,FSTYPE'], 
                                  capture_output=True, text=True, timeout=10)
            logger.info("Using lsblk fallback format")
            
        # Get disk usage information using df
        df_output = ""
        try:
            result_df = subprocess.run(['df', '-h', '--output=source,size,used,avail,pcent,target,fstype'], 
                                     capture_output=True, text=True, timeout=10)
            df_output = result_df.stdout
            logger.info("Successfully got df data")
        except subprocess.TimeoutExpired as e:
            logger.warning(f"df command timed out: {e}")
            
        # Parse the output and combine information
        disks = []
        
        # Process lsblk data
        if 'blockdevices' in lsblk_data:
            for device in lsblk_data['blockdevices']:
                device_type = device.get('type', '')
                device_name = device.get('name', '')
                
                # Skip loop devices (snap packages), ROM devices, and floppy drives
                # Keep actual disk devices including ZFS devices (zd*)
                if device_type in ['loop', 'rom'] or device_name.startswith('fd'):
                    continue
                
                # Determine filesystem information from device and its partitions
                filesystem = device.get('fstype', '') or ''
                mountpoint = device.get('mountpoint', '') or ''
                
                # If the device has partitions (children), get the first partition's filesystem info
                if 'children' in device and device['children']:
                    # For disk devices, use the first partition's filesystem if the disk itself doesn't have one
                    if device_type == 'disk' and not filesystem:
                        for child in device['children']:
                            child_fstype = child.get('fstype')
                            child_mountpoint = child.get('mountpoint')
                            if child_fstype:  # Found a partition with filesystem
                                filesystem = child_fstype
                                if not mountpoint and child_mountpoint:
                                    mountpoint = child_mountpoint
                                break
                
                disk_info = {
                    'name': device_name,
                    'path': f"/dev/{device_name}",
                    'size': str(device.get('size', '0')),
                    'type': device_type,
                    'mountpoint': mountpoint,
                    'filesystem': filesystem,
                    'model': device.get('model') or '',
                    'serial': device.get('serial') or '',
                    'used': '',
                    'available': '',
                    'use_percent': ''
                }
                
                # Look for corresponding df data
                if df_output:
                    for line in df_output.split('\n')[1:]:  # Skip header
                        if line.strip() and device_name in line:
                            parts = line.split()
                            if len(parts) >= 6:
                                disk_info['used'] = parts[2] if parts[2] != '0' else ''
                                disk_info['available'] = parts[3] if parts[3] != '0' else ''
                                disk_info['use_percent'] = parts[4].rstrip('%') if parts[4] != '0%' else ''
                                break
                
                disks.append(disk_info)
        
        logger.info(f"Successfully processed {len(disks)} disk devices")
        return {'data': disks, 'success': True}
        
    except Exception as e:
        logger.error(f"Error getting system disks: {e}")
        return {'data': [], 'error': str(e), 'success': False}

# ZFS Pool Management endpoints
@app.get("/api/zfs/available-disks")
async def get_available_disks():
    """Get available disks for pool creation"""
    try:
        disks = zfs_manager.get_available_disks()
        return disks
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get available disks: {str(e)}")

@app.get("/api/zfs/compression-algorithms")
async def get_compression_algorithms():
    """Get available ZFS compression algorithms"""
    try:
        algorithms = zfs_manager.get_compression_algorithms()
        return algorithms
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get compression algorithms: {str(e)}")

@app.post("/api/zfs/pool")
async def create_pool(pool: PoolCreate):
    """Create a new ZFS pool"""
    try:
        result = zfs_manager.create_pool(pool.name, pool.devices, pool.mountpoint, pool.compression)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to create pool: {str(e)}"
        }

@app.delete("/api/zfs/pool")
async def delete_pool(name: str):
    """Delete a ZFS pool and wipe ZFS metadata from disks"""
    try:
        result = zfs_manager.destroy_pool(name)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to delete pool: {str(e)}"
        }

@app.get("/api/zfs/importable-pools")
async def get_importable_pools():
    """Get list of ZFS pools that can be imported"""
    try:
        pools = zfs_manager.list_importable_pools()
        return pools
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get importable pools: {str(e)}")

@app.post("/api/zfs/import-pool")
async def import_pool(pool: PoolImport):
    """Import a ZFS pool"""
    try:
        result = zfs_manager.import_pool(pool.name, pool.pool_id)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to import pool: {str(e)}"
        }

# iSCSI Targets endpoints
@app.get("/api/targets")
async def get_targets():
    try:
        return iscsi_backend.get_targets()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get targets: {str(e)}")

@app.post("/api/targets")
async def create_target(target: TargetCreate):
    try:
        zvol_path = f"/dev/zvol/{target.pool_name}/{target.zvol_name}"
        result = iscsi_backend.create_target(target.name, zvol_path)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to create target: {str(e)}"
        }

@app.post("/api/targets/acl")
async def add_acl(acl: ACLCreate):
    try:
        result = iscsi_backend.add_acl(acl.target_iqn, acl.client_iqn)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to add ACL: {str(e)}"
        }

@app.delete("/api/targets/acl")
async def remove_acl(acl: ACLCreate):
    try:
        logger.info(f"Removing ACL: target_iqn={acl.target_iqn}, client_iqn={acl.client_iqn}")
        result = iscsi_backend.remove_acl(acl.target_iqn, acl.client_iqn)
        logger.info(f"ACL removal result: {result}")
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        logger.error(f"Exception removing ACL: {str(e)}")
        return {
            'success': False,
            'message': f"Failed to remove ACL: {str(e)}"
        }

@app.post("/api/targets/restore")
async def restore_targets():
    """Restore iSCSI targets from saved configuration"""
    try:
        result = iscsi_backend.restore_targets()
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to restore targets: {str(e)}"
        }

@app.get("/api/targets/saveconfig")
async def get_saveconfig():
    """Get the saved iSCSI configuration"""
    try:
        result = iscsi_backend.get_saveconfig()
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to get saveconfig: {str(e)}"
        }

@app.delete("/api/targets/{target_iqn}")
async def delete_target(target_iqn: str):
    try:
        result = iscsi_backend.delete_target(target_iqn)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to delete target: {str(e)}"
        }

# ZFS Management endpoints
@app.get("/api/zfs/pools")
async def get_pools():
    try:
        return zfs_manager.list_pools()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get pools: {str(e)}")

@app.get("/api/zfs/datasets")
async def get_datasets():
    try:
        return zfs_manager.list_datasets()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get datasets: {str(e)}")

@app.get("/api/zfs/zvols/available")
async def get_available_zvols(pool_name: Optional[str] = None):
    try:
        return zfs_manager.get_available_zvols(pool_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get available zvols: {str(e)}")

@app.post("/api/zfs/zvol")
async def create_zvol(zvol: ZvolCreate):
    try:
        result = zfs_manager.create_zvol(zvol.name, zvol.size, zvol.pool, zvol.compression)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to create zvol: {str(e)}"
        }

@app.delete("/api/zfs/zvol")
async def delete_zvol(name: str, pool: str = "tank"):
    try:
        result = zfs_manager.delete_zvol(name, pool)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('message'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete zvol: {str(e)}")

@app.put("/api/zfs/zvol/resize")
async def resize_zvol(resize: ZvolResize):
    try:
        result = zfs_manager.resize_zvol(resize.name, resize.new_size, resize.pool)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to resize zvol: {str(e)}"
        }

@app.put("/api/zfs/dataset/resize")
async def resize_dataset(resize: DatasetResize):
    try:
        result = zfs_manager.resize_dataset(resize.name, resize.new_quota, resize.pool)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to resize dataset: {str(e)}"
        }

# Dataset endpoints
@app.post("/api/zfs/dataset")
async def create_dataset(dataset: DatasetCreate):
    try:
        result = zfs_manager.create_dataset(dataset.name, dataset.pool, dataset.quota, dataset.compression)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to create dataset: {str(e)}"
        }

@app.delete("/api/zfs/dataset")
async def delete_dataset(name: str, pool: str = "tank"):
    try:
        result = zfs_manager.delete_dataset(name, pool)
        if not result.get('success'):
            raise HTTPException(status_code=400, detail=result.get('message'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete dataset: {str(e)}")

# Snapshot endpoints - Updated with new backend
@app.get("/api/zfs/snapshots")
async def get_snapshots(dataset: Optional[str] = None):
    """Get all ZFS snapshots, optionally filtered by dataset"""
    try:
        snapshots = snapshot_backend.list_snapshots(dataset)
        return snapshots
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get snapshots: {str(e)}")

@app.post("/api/zfs/snapshot")
async def create_snapshot(snapshot: SnapshotCreate):
    """Create a ZFS snapshot"""
    try:
        result = snapshot_backend.create_snapshot(snapshot.dataset, snapshot.snapshot_name)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to create snapshot: {str(e)}"
        }

@app.delete("/api/zfs/snapshot")
async def delete_snapshot(snapshot: SnapshotDelete):
    """Delete a ZFS snapshot"""
    try:
        result = snapshot_backend.delete_snapshot(snapshot.snapshot_name)
        if not result.get('success'):
            # Return the result with error details instead of raising HTTPException
            # This allows the frontend to handle the error appropriately
            return result
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete snapshot: {str(e)}")

@app.post("/api/zfs/snapshot/rollback")
async def rollback_snapshot(snapshot: SnapshotRollback):
    """Rollback to a ZFS snapshot"""
    try:
        result = snapshot_backend.rollback_snapshot(snapshot.snapshot_name)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to rollback snapshot: {str(e)}"
        }

@app.post("/api/zfs/snapshot/clone")
async def clone_snapshot(clone: SnapshotClone):
    """Clone a ZFS snapshot to a new dataset"""
    try:
        result = snapshot_backend.clone_snapshot(clone.snapshot_name, clone.clone_name)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to clone snapshot: {str(e)}"
        }

@app.post("/api/zfs/snapshot/schedule")
async def schedule_snapshot(schedule: SnapshotSchedule):
    """Schedule a ZFS snapshot using crontab"""
    try:
        result = snapshot_backend.schedule_snapshot(
            schedule.dataset,
            schedule.snapshot_name,
            schedule.schedule_type,
            schedule.hour,
            schedule.minute,
            schedule.day_of_week,
            schedule.day_of_month,
            schedule.month,
            schedule.retention_days
        )
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to schedule snapshot: {str(e)}"
        }

@app.get("/api/zfs/snapshots/scheduled")
async def get_scheduled_snapshots():
    """Get all scheduled ZFS snapshots from crontab"""
    try:
        snapshots = snapshot_backend.list_scheduled_snapshots()
        return snapshots
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get scheduled snapshots: {str(e)}")

@app.delete("/api/zfs/snapshot/scheduled")
async def remove_scheduled_snapshot(dataset: str, snapshot_name: str):
    """Remove a scheduled snapshot from crontab"""
    try:
        result = snapshot_backend.remove_scheduled_snapshot(dataset, snapshot_name)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to remove scheduled snapshot: {str(e)}"
        }

@app.get("/api/zfs/snapshot/logs")
async def get_snapshot_logs(dataset: str, snapshot_name: str, limit: int = 20):
    """Get logs for a specific scheduled snapshot"""
    try:
        logs = snapshot_backend.get_snapshot_logs(dataset, snapshot_name, limit)
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get snapshot logs: {str(e)}")

# ===== DELEGATED ADMINISTRATORS ENDPOINTS =====

@app.get("/api/admin/delegated")
async def get_delegated_users():
    """Get all delegated administrators"""
    try:
        delegated_users = auth_manager.get_delegated_users()
        return {'success': True, 'data': delegated_users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get delegated users: {str(e)}")

@app.post("/api/admin/delegated/admin")
async def add_admin_user(username: str):
    """Add user as full access administrator"""
    try:
        # Check if user exists
        if not user_manager.user_exists(username):
            raise HTTPException(status_code=404, detail="User not found")

        success = auth_manager.add_admin_user(username)
        if success:
            return {'success': True, 'message': f'User {username} added as full access administrator'}
        else:
            raise HTTPException(status_code=500, detail="Failed to add admin user")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add admin user: {str(e)}")

@app.post("/api/admin/delegated/readonly")
async def add_readonly_user(username: str):
    """Add user as read-only administrator"""
    try:
        # Check if user exists
        if not user_manager.user_exists(username):
            raise HTTPException(status_code=404, detail="User not found")

        success = auth_manager.add_readonly_user(username)
        if success:
            return {'success': True, 'message': f'User {username} added as read-only administrator'}
        else:
            raise HTTPException(status_code=500, detail="Failed to add readonly user")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add readonly user: {str(e)}")

@app.delete("/api/admin/delegated/{username}")
async def remove_delegated_user(username: str):
    """Remove user from delegated administrators"""
    try:
        success = auth_manager.remove_delegated_user(username)
        if success:
            return {'success': True, 'message': f'User {username} removed from delegated administrators'}
        else:
            raise HTTPException(status_code=500, detail="Failed to remove delegated user")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove delegated user: {str(e)}")

# ===== USERS AND GROUPS ENDPOINTS (DATABASE REMOVED) =====

@app.get("/api/users")
async def get_users():
    """Get all system users (UID >= 1000) with Samba status"""
    try:
        system_users = user_manager.get_system_users()
        
        # Enhance with Samba status
        enhanced_users = []
        for user in system_users:
            # Check if user has Samba account AND it's enabled
            samba_enabled = user_manager.check_samba_user(user['username'])
            
            enhanced_users.append({
                'id': user['uid'],  # Use UID as ID
                'username': user['username'],
                'full_name': user['full_name'],
                'groups': user['groups'],
                'samba_enabled': samba_enabled,
                'created_at': 'System User',
                'is_system_user': False  # All are system users now
            })
        
        return enhanced_users
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get users: {str(e)}")

@app.post("/api/users")
async def create_user(user: UserCreate):
    """Create system user and optionally setup Samba"""
    try:
        # Check if user already exists
        if user_manager.user_exists(user.username):
            raise HTTPException(status_code=400, detail="User already exists")
        
        # Create system user
        user_result = user_manager.create_system_user(user.username, user.full_name, user.password)
        if not user_result.get('success'):
            raise HTTPException(status_code=500, detail=user_result.get('message'))
        
        # Add to groups
        for group_name in user.groups:
            # Create group if it doesn't exist
            if not user_manager.group_exists(group_name):
                user_manager.create_system_group(group_name)
            
            # Add user to group
            user_manager.add_user_to_group(user.username, group_name)
        
        # Setup Samba if requested
        if user.enable_samba:
            # Check if user already has Samba account
            if user_manager.check_samba_user(user.username):
                logger.warning(f"User {user.username} already has Samba account, skipping setup")
            else:
                samba_result = samba_manager.setup_samba_user(user.username, user.password)
                if not samba_result.get('success'):
                    logger.warning(f"Failed to setup Samba for user {user.username}: {samba_result.get('message')}")
        
        return {"success": True, "message": f"User {user.username} created successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        # Cleanup on failure
        try:
            user_manager.delete_system_user(user.username)
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@app.delete("/api/users/{username}")
async def delete_user(username: str):
    """Delete system user"""
    try:
        # Remove Samba user first
        try:
            samba_manager.remove_samba_user(username)
        except Exception as e:
            logger.warning(f"Failed to remove Samba user {username}: {e}")
        
        # Delete system user
        user_result = user_manager.delete_system_user(username)
        if not user_result.get('success'):
            raise HTTPException(status_code=400, detail=user_result.get('message'))
        
        return {"success": True, "message": f"User {username} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")

@app.post("/api/users/{username}/enable-samba")
async def enable_samba_user(username: str, samba_password: SambaPassword):
    """Enable Samba access for user with password"""
    try:
        # Check if user exists
        if not user_manager.user_exists(username):
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if user already has ENABLED Samba account
        if user_manager.check_samba_user(username):
            raise HTTPException(status_code=400, detail=f"User {username} already has Samba account enabled")
        
        # Setup Samba user with password
        samba_result = samba_manager.setup_samba_user(username, samba_password.password)
        if not samba_result.get('success'):
            raise HTTPException(status_code=500, detail=samba_result.get('message'))
        
        return {"success": True, "message": f"Samba enabled for user {username}"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to enable Samba: {str(e)}")

@app.post("/api/users/{username}/disable-samba")
async def disable_samba_user(username: str):
    """Disable Samba access for user"""
    try:
        # Check if user exists
        if not user_manager.user_exists(username):
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if user has Samba account (any status)
        if not user_manager._check_samba_user_simple(username):
            raise HTTPException(status_code=400, detail=f"User {username} does not have Samba account")
        
        # Disable Samba user
        samba_result = samba_manager.disable_samba_user(username)
        if not samba_result.get('success'):
            raise HTTPException(status_code=500, detail=samba_result.get('message'))
        
        return {"success": True, "message": f"Samba disabled for user {username}"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to disable Samba: {str(e)}")

@app.get("/api/users/groups")
async def get_groups():
    """Get all system groups (GID >= 1000)"""
    try:
        system_groups = user_manager.get_system_groups()
        
        enhanced_groups = []
        for group in system_groups:
            enhanced_groups.append({
                'id': group['gid'],  # Use GID as ID
                'name': group['name'],
                'users': group['members'],
                'created_at': 'System Group',
                'is_system_group': False  # All are system groups now
            })
        
        return enhanced_groups
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get groups: {str(e)}")

@app.post("/api/users/groups")
async def create_group(group: GroupCreate):
    """Create system group"""
    try:
        # Check if group already exists
        if user_manager.group_exists(group.name):
            raise HTTPException(status_code=400, detail="Group already exists")
        
        # Create system group
        group_result = user_manager.create_system_group(group.name)
        if not group_result.get('success'):
            raise HTTPException(status_code=500, detail=group_result.get('message'))
        
        return {"success": True, "message": f"Group {group.name} created successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create group: {str(e)}")

@app.delete("/api/users/groups/{group_name}")
async def delete_group(group_name: str):
    """Delete system group"""
    try:
        group_result = user_manager.delete_system_group(group_name)
        if not group_result.get('success'):
            raise HTTPException(status_code=400, detail=group_result.get('message'))
        
        return {"success": True, "message": f"Group {group_name} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete group: {str(e)}")

@app.post("/api/users/groups/{group_name}/add-user")
async def add_user_to_group(group_name: str, user_data: AddUserToGroup):
    """Add user to group"""
    try:
        # Check if group exists
        if not user_manager.group_exists(group_name):
            raise HTTPException(status_code=404, detail="Group not found")
        
        # Check if user exists
        if not user_manager.user_exists(user_data.username):
            raise HTTPException(status_code=404, detail="User not found")
        
        # Add user to group
        result = user_manager.add_user_to_group(user_data.username, group_name)
        if not result.get('success'):
            raise HTTPException(status_code=500, detail=result.get('message'))
        
        return {"success": True, "message": f"User {user_data.username} added to group {group_name}"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add user to group: {str(e)}")

@app.post("/api/users/groups/{group_name}/remove-user")
async def remove_user_from_group(group_name: str, user_data: RemoveUserFromGroup):
    """Remove user from group"""
    try:
        # Check if group exists
        if not user_manager.group_exists(group_name):
            raise HTTPException(status_code=404, detail="Group not found")

        # Check if user exists
        if not user_manager.user_exists(user_data.username):
            raise HTTPException(status_code=404, detail="User not found")

        # Remove user from group
        result = user_manager.remove_user_from_group(user_data.username, group_name)
        if not result.get('success'):
            raise HTTPException(status_code=500, detail=result.get('message'))

        return {"success": True, "message": f"User {user_data.username} removed from group {group_name}"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove user from group: {str(e)}")

@app.put("/api/users/{username}")
async def update_user(username: str, user_update: UserUpdate):
    """Update system user details (full name, password, groups)"""
    try:
        # Check if user exists
        if not user_manager.user_exists(username):
            raise HTTPException(status_code=404, detail="User not found")

        # Update password if provided
        if user_update.password:
            password_result = user_manager.update_user_password(username, user_update.password)
            if not password_result.get('success'):
                raise HTTPException(status_code=500, detail=password_result.get('message'))

        # Update full name if provided
        if user_update.full_name:
            name_result = user_manager.update_user_full_name(username, user_update.full_name)
            if not name_result.get('success'):
                raise HTTPException(status_code=500, detail=name_result.get('message'))

        # Update groups if provided
        if user_update.groups is not None:
            groups_result = user_manager.update_user_groups(username, user_update.groups)
            if not groups_result.get('success'):
                raise HTTPException(status_code=500, detail=groups_result.get('message'))

        return {"success": True, "message": f"User {username} updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

# ===== SAMBA ENDPOINTS =====

@app.get("/api/samba/shares")
async def get_samba_shares():
    """Get Samba shares directly from config file with audit status"""
    try:
        config = samba_manager.read_config()
        shares = []
        
        for share_name, share_config in config.get('shares', {}).items():
            # Skip if it's the global config
            if share_name.lower() == 'global':
                continue
                
            # Check if audit is enabled for this share
            vfs_objects = share_config.get('vfs objects', '').lower()
            audit_enabled = 'full_audit' in vfs_objects
            
            shares.append({
                'name': share_name,
                'path': share_config.get('path', ''),
                'browseable': share_config.get('browseable', 'yes').lower() == 'yes',
                'writable': share_config.get('writable', 'yes').lower() == 'yes',
                'valid_users': share_config.get('valid users', ''),
                'force_group': share_config.get('force group', ''),
                'audit_enabled': audit_enabled
            })
        
        return {'data': shares}
    except Exception as e:
        # Return a proper error response instead of raising exception
        logger.error(f"Error getting Samba shares: {e}")
        return {'data': [], 'error': str(e)}

@app.post("/api/samba/shares")
async def create_samba_share(share: SambaShareCreate):
    """Create Samba share directly in config file - FIXED VERSION with audit support"""
    try:
        # Verify path exists
        if not os.path.exists(share.path):
            return {
                'success': False,
                'message': f"Path does not exist: {share.path}"
            }

        # Use the new method that handles permissions properly with audit support
        result = samba_manager.create_share_with_permissions(
            share.name,
            share.path,
            share.browseable,
            share.writable,
            share.valid_users,
            share.force_group,
            share.audit_enabled
        )

        if not result.get('success'):
            return result  # Return error details instead of raising exception

        return result

    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to create Samba share: {str(e)}"
        }

@app.delete("/api/samba/shares/{share_name}")
async def delete_samba_share(share_name: str):
    """Delete Samba share directly from config file"""
    try:
        success = samba_manager.delete_share(share_name)
        if not success:
            return {
                'success': False,
                'message': "Samba share not found"
            }

        # Test and restart Samba
        test_result = samba_manager.test_samba_config()
        if not test_result.get('success'):
            logger.warning(f"Samba configuration test failed: {test_result.get('message')}")

        restart_result = samba_manager.restart_samba_services()
        if not restart_result.get('success'):
            logger.warning(f"Failed to restart Samba services: {restart_result.get('message')}")

        return {"success": True, "message": f"Samba share {share_name} deleted successfully"}

    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to delete Samba share: {str(e)}"
        }

@app.post("/api/samba/shares/{share_name}/fix-permissions")
async def fix_share_permissions(share_name: str):
    """Fix permissions for a specific share to enforce proper access control"""
    try:
        result = samba_manager.fix_share_permissions(share_name)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to fix share permissions: {str(e)}"
        }

@app.post("/api/samba/shares/fix-all-permissions")
async def fix_all_shares_permissions():
    """Fix permissions for all shares to enforce proper access control"""
    try:
        result = samba_manager.fix_all_shares_permissions()
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to fix all shares permissions: {str(e)}"
        }

@app.get("/api/samba/config")
async def get_samba_config():
    """Get Samba global config directly from config file"""
    try:
        global_config = samba_manager.get_global_config()
        
        # Map to our expected format
        return {
            'workgroup': global_config.get('workgroup', 'WORKGROUP'),
            'server_string': global_config.get('server string', 'ZFS Storage Server'),
            'netbios_name': global_config.get('netbios name', 'ZFS-SERVER')
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get Samba config: {str(e)}")

@app.post("/api/samba/config")
async def update_samba_config_api(config: SambaConfig):
    """Update Samba global config directly in config file"""
    try:
        # Prepare global configuration
        global_config = {
            'workgroup': config.workgroup,
            'server string': config.server_string,
            'netbios name': config.netbios_name,
            'security': 'user',
            'map to guest': 'bad user',
            'dns proxy': 'no',
            'log file': '/var/log/samba/log.%m',
            'max log size': '1000',
            'syslog': '0',
            'panic action': '/usr/share/samba/panic-action %d'
        }

        # Update global config
        success = samba_manager.update_global_config(global_config)
        if not success:
            return {
                'success': False,
                'message': "Failed to update Samba configuration"
            }

        # Test and restart Samba
        test_result = samba_manager.test_samba_config()
        if not test_result.get('success'):
            logger.warning(f"Samba configuration test failed: {test_result.get('message')}")

        restart_result = samba_manager.restart_samba_services()
        if not restart_result.get('success'):
            logger.warning(f"Failed to restart Samba services: {restart_result.get('message')}")

        return {"success": True, "message": "Samba configuration updated successfully"}

    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to update Samba config: {str(e)}"
        }

@app.post("/api/samba/restart")
async def restart_samba():
    try:
        result = samba_manager.restart_samba_services()
        if result.get('success'):
            return {"success": True, "message": "Samba service restarted successfully", "details": result.get('results')}
        else:
            return result  # Return error details instead of raising exception
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to restart Samba: {str(e)}"
        }

@app.get("/api/samba/status")
async def get_samba_status():
    try:
        result = samba_manager.get_samba_service_status()
        if result.get('success'):
            return {"success": True, "services": result.get('services')}
        else:
            return result  # Return error details instead of raising exception
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to get Samba status: {str(e)}"
        }

# Samba Audit endpoints
@app.get("/api/samba/audit/logs")
async def get_samba_audit_logs(lines: int = 100):
    """Get Samba audit logs from the dedicated audit log file"""
    try:
        result = samba_manager.get_audit_logs(lines)
        if result.get('success'):
            return result
        else:
            return result  # Return error details instead of raising exception
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to get audit logs: {str(e)}"
        }

@app.post("/api/samba/audit/setup")
async def setup_samba_audit():
    """Set up rsyslog configuration for Samba audit logging"""
    try:
        result = samba_manager.setup_audit_logging()
        if result.get('success'):
            return {
                "success": True, 
                "message": "Samba audit logging setup completed successfully",
                "details": result.get('results')
            }
        else:
            return result  # Return error details instead of raising exception
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to set up audit logging: {str(e)}"
        }

# Service Management endpoints
@app.get("/api/services")
async def get_all_services():
    try:
        result = service_manager.get_all_services_status()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get services status: {str(e)}")

@app.get("/api/services/{service_key}")
async def get_service_status(service_key: str):
    try:
        result = service_manager.get_service_status(service_key)
        if not result.get('success'):
            raise HTTPException(status_code=404, detail=result.get('message'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get service status: {str(e)}")

@app.post("/api/services/{service_key}/start")
async def start_service(service_key: str):
    try:
        result = service_manager.start_service(service_key)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to start service: {str(e)}"
        }

@app.post("/api/services/{service_key}/stop")
async def stop_service(service_key: str):
    try:
        result = service_manager.stop_service(service_key)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to stop service: {str(e)}"
        }

@app.post("/api/services/{service_key}/restart")
async def restart_service(service_key: str):
    try:
        result = service_manager.restart_service(service_key)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to restart service: {str(e)}"
        }

@app.post("/api/services/{service_key}/enable")
async def enable_service(service_key: str):
    try:
        result = service_manager.enable_service(service_key)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to enable service: {str(e)}"
        }

@app.post("/api/services/{service_key}/disable")
async def disable_service(service_key: str):
    try:
        result = service_manager.disable_service(service_key)
        if not result.get('success'):
            return result  # Return error details instead of raising exception
        return result
    except Exception as e:
        return {
            'success': False,
            'message': f"Failed to disable service: {str(e)}"
        }

@app.get("/api/services/{service_key}/logs")
async def get_service_logs(service_key: str, lines: int = 50):
    try:
        result = service_manager.get_service_logs(service_key, lines)
        if not result.get('success'):
            raise HTTPException(status_code=404, detail=result.get('message'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get service logs: {str(e)}")
    
# For development without reload
if __name__ == "__main__":
    import uvicorn
    import socket

    # Get the local IP address
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except socket.gaierror:
        local_ip = "127.0.0.1"

    logger.info("Starting ZFS iSCSI Manager API...")
    logger.info(f"Local URL: http://localhost:2435")
    logger.info(f"Network URL: http://{local_ip}:2435")
    logger.info("API documentation: http://localhost:2435/docs")

    uvicorn.run(app, host="0.0.0.0", port=2435, reload=False)