#!/usr/bin/env python3
import subprocess
import platform
import os
from datetime import datetime
import time
import logging
import re

logger = logging.getLogger(__name__)

class SystemInfoManager:
    """Manager for system information using system commands"""

    def get_system_info(self):
        """Get comprehensive system information using system commands"""
        try:
            system_info = {}

            # PC Name / Hostname using hostname command
            try:
                result = subprocess.run(['hostname'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    system_info['hostname'] = result.stdout.strip()
                else:
                    system_info['hostname'] = platform.node()
            except Exception as e:
                logger.warning(f"Could not get hostname: {e}")
                system_info['hostname'] = platform.node()

            # Kernel version using uname command
            try:
                result = subprocess.run(['uname', '-r'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    system_info['kernel_version'] = result.stdout.strip()
                else:
                    system_info['kernel_version'] = platform.release()
            except Exception as e:
                logger.warning(f"Could not get kernel version: {e}")
                system_info['kernel_version'] = platform.release()

            # Current date and time using date command
            try:
                result = subprocess.run(['date'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    system_info['current_datetime'] = result.stdout.strip()
                else:
                    system_info['current_datetime'] = datetime.now().strftime('%a %b %d %H:%M:%S %Z %Y')
            except Exception as e:
                logger.warning(f"Could not get current datetime: {e}")
                system_info['current_datetime'] = datetime.now().strftime('%a %b %d %H:%M:%S %Z %Y')

            # Timezone using date command with full timezone name
            try:
                # First try to get the full timezone name and offset
                try:
                    result_tz = subprocess.run(['timedatectl', 'show', '--property=Timezone', '--value'], capture_output=True, text=True, timeout=5)
                    if result_tz.returncode == 0:
                        tz_name = result_tz.stdout.strip()
                        offset_result = subprocess.run(['date', '+%z'], capture_output=True, text=True, timeout=5)
                        if offset_result.returncode == 0:
                            offset = offset_result.stdout.strip()
                            system_info['timezone'] = f"{tz_name} ({offset})"
                        else:
                            system_info['timezone'] = tz_name
                    else:
                        raise Exception("timedatectl failed")
                except Exception:
                    # Try reading from /etc/timezone
                    try:
                        with open('/etc/timezone', 'r') as f:
                            tz_name = f.read().strip()
                        offset_result = subprocess.run(['date', '+%z'], capture_output=True, text=True, timeout=5)
                        if offset_result.returncode == 0:
                            offset = offset_result.stdout.strip()
                            system_info['timezone'] = f"{tz_name} ({offset})"
                        else:
                            system_info['timezone'] = tz_name
                    except Exception:
                        # Use date command with timezone name
                        result = subprocess.run(['date', '+%Z (%z)'], capture_output=True, text=True, timeout=5)
                        if result.returncode == 0:
                            system_info['timezone'] = result.stdout.strip()
                        else:
                            # Final fallback
                            system_info['timezone'] = time.tzname[0] if hasattr(time, 'tzname') and time.tzname else 'Unknown'
            except Exception as e:
                logger.warning(f"Could not get timezone: {e}")
                system_info['timezone'] = time.tzname[0] if hasattr(time, 'tzname') and time.tzname else 'Unknown'

            # Uptime using uptime command
            try:
                result = subprocess.run(['uptime', '-p'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    system_info['uptime'] = result.stdout.strip()
                else:
                    # Fallback to calculating uptime from /proc/uptime
                    try:
                        with open('/proc/uptime', 'r') as f:
                            uptime_seconds = float(f.readline().split()[0])
                        days = int(uptime_seconds // 86400)
                        hours = int((uptime_seconds % 86400) // 3600)
                        minutes = int((uptime_seconds % 3600) // 60)

                        if days > 0:
                            system_info['uptime'] = f"{days} days, {hours} hours, {minutes} minutes"
                        elif hours > 0:
                            system_info['uptime'] = f"{hours} hours, {minutes} minutes"
                        else:
                            system_info['uptime'] = f"{minutes} minutes"
                    except Exception as e2:
                        logger.warning(f"Could not calculate uptime: {e2}")
                        system_info['uptime'] = 'Unknown'
            except Exception as e:
                logger.warning(f"Could not get uptime: {e}")
                system_info['uptime'] = 'Unknown'

            # RAM information using free command
            try:
                result = subprocess.run(['free', '-h'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')
                    if len(lines) >= 2:
                        # Find the Mem: line
                        mem_line = None
                        for line in lines:
                            if line.startswith('Mem:'):
                                mem_line = line.split()
                                break
                        if mem_line and len(mem_line) >= 7:
                            system_info['ram_total'] = mem_line[1]
                            system_info['ram_used'] = mem_line[2]
                            system_info['ram_free'] = mem_line[3]
                            system_info['ram_shared'] = mem_line[4]
                            system_info['ram_buff_cache'] = mem_line[5]
                            system_info['ram_available'] = mem_line[6]
                        elif mem_line and len(mem_line) >= 4:  # Fallback for different free output formats
                            system_info['ram_total'] = mem_line[1]
                            system_info['ram_used'] = mem_line[2]
                            system_info['ram_free'] = mem_line[3]
                            system_info['ram_available'] = mem_line[3]  # Approximate available as free
                else:
                    # Fallback to /proc/meminfo
                    try:
                        with open('/proc/meminfo', 'r') as f:
                            meminfo = f.read()
                        total_match = re.search(r'MemTotal:\s+(\d+)\s+kB', meminfo)
                        available_match = re.search(r'MemAvailable:\s+(\d+)\s+kB', meminfo)
                        if total_match and available_match:
                            total_kb = int(total_match.group(1))
                            available_kb = int(available_match.group(1))
                            used_kb = total_kb - available_kb
                            system_info['ram_total'] = f"{total_kb // 1024} MB"
                            system_info['ram_used'] = f"{used_kb // 1024} MB"
                            system_info['ram_available'] = f"{available_kb // 1024} MB"
                    except Exception as e2:
                        logger.warning(f"Could not get RAM info from /proc/meminfo: {e2}")
            except Exception as e:
                logger.warning(f"Could not get RAM info: {e}")

            # CPU cores information
            try:
                result = subprocess.run(['nproc'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    system_info['cpu_cores'] = int(result.stdout.strip())
                else:
                    # Fallback to /proc/cpuinfo
                    try:
                        with open('/proc/cpuinfo', 'r') as f:
                            cpuinfo = f.read()
                        cpu_count = len(re.findall(r'^processor\s*:\s*\d+', cpuinfo, re.MULTILINE))
                        system_info['cpu_cores'] = cpu_count
                    except Exception as e2:
                        logger.warning(f"Could not get CPU cores from /proc/cpuinfo: {e2}")
                        system_info['cpu_cores'] = 'Unknown'
            except Exception as e:
                logger.warning(f"Could not get CPU cores: {e}")
                system_info['cpu_cores'] = 'Unknown'

            # Storage information using df command
            try:
                result = subprocess.run(['df', '-h', '--total'], capture_output=True, text=True, timeout=10)
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')
                    if len(lines) >= 2:
                        total_line = None
                        for line in lines:
                            if line.startswith('total'):
                                total_line = line
                                break
                        if total_line:
                            parts = total_line.split()
                            if len(parts) >= 6:
                                system_info['storage_total'] = parts[1]
                                system_info['storage_used'] = parts[2]
                                system_info['storage_free'] = parts[3]
                                system_info['storage_use_percent'] = parts[4]
                        else:
                            # If no total line, get root filesystem info
                            for line in lines[1:]:
                                if line.split()[-1] == '/':
                                    parts = line.split()
                                    if len(parts) >= 6:
                                        system_info['storage_total'] = parts[1]
                                        system_info['storage_used'] = parts[2]
                                        system_info['storage_free'] = parts[3]
                                        system_info['storage_use_percent'] = parts[4]
                                    break
                else:
                    system_info['storage_total'] = 'Unknown'
                    system_info['storage_used'] = 'Unknown'
                    system_info['storage_free'] = 'Unknown'
                    system_info['storage_use_percent'] = 'Unknown'
            except Exception as e:
                logger.warning(f"Could not get storage info: {e}")
                system_info['storage_total'] = 'Unknown'
                system_info['storage_used'] = 'Unknown'
                system_info['storage_free'] = 'Unknown'
                system_info['storage_use_percent'] = 'Unknown'

            return {'success': True, 'data': system_info}

        except Exception as e:
            logger.error(f"Error getting system info: {e}")
            return {'success': False, 'error': str(e)}