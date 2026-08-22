#!/usr/bin/env python3
# login.py

import subprocess
import logging
import json
from typing import Dict, Optional
import os
import sys
import time
import jwt
from datetime import datetime, timedelta

# Try to import passlib, fallback if not available
try:
    from passlib.hash import sha256_crypt  # type: ignore
    HAS_PASSLIB = True
except ImportError:
    HAS_PASSLIB = False
    logging.warning("passlib not available, password verification will be limited")
    sha256_crypt = None  # type: ignore

# Add current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

logger = logging.getLogger(__name__)

class AuthManager:
    def __init__(self, secret_key: str = "zfs-iscsi-secret-key-change-in-production"):
        self.secret_key = secret_key
        self.session_timeout = 3600  # 1 hour in seconds
        # Define admin users (users in sudo group get full access)
        self.admin_users = set()  # Will be populated dynamically
        self.readonly_users = set()  # Will be populated dynamically
        self.delegated_users_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'delegated_admins.json')
        self._load_delegated_users()

    def authenticate_user(self, username: str, password: str) -> Dict:
        """Authenticate user against system users - allow sudo users and delegated administrators"""
        try:
            # Check if user exists (using id command)
            user_exists_result = subprocess.run(
                ['id', username],
                capture_output=True,
                text=True,
                timeout=10
            )

            if user_exists_result.returncode != 0:
                return {
                    'success': False,
                    'message': 'User does not exist'
                }

            # Check if user has access (sudo group OR delegated administrator)
            is_sudo_user = self._is_sudo_user(username)
            user_role = self.get_user_role(username)

            if not is_sudo_user and user_role == 'none':
                return {
                    'success': False,
                    'message': 'Access denied: User is not authorized to access this system'
                }

            # Authenticate password using PAM or direct check
            if self._verify_password(username, password):
                # Generate JWT token
                token = self._generate_token(username)
                return {
                    'success': True,
                    'message': f'Welcome {username}',
                    'token': token,
                    'user': {
                        'username': username,
                        'groups': self._get_user_groups(username),
                        'role': user_role
                    }
                }
            else:
                return {
                    'success': False,
                    'message': 'Invalid username or password'
                }

        except Exception as e:
            logger.error(f"Authentication error for user {username}: {e}")
            return {
                'success': False,
                'message': 'Authentication failed due to system error'
            }

    def verify_token(self, token: str) -> Optional[Dict]:
        """Verify JWT token and return user info if valid"""
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=['HS256'])

            # Check if token is expired
            exp = payload.get('exp', 0)
            if time.time() > exp:
                return None

            return {
                'username': payload['username'],
                'groups': payload.get('groups', []),
                'role': payload.get('role', 'none')
            }

        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None
        except Exception as e:
            logger.error(f"Token verification error: {e}")
            return None

    def _is_sudo_user(self, username: str) -> bool:
        """Check if user is in sudo group"""
        try:
            # Check if user exists
            result = subprocess.run(
                ['id', username],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode != 0:
                return False

            # Check if user is in sudo group
            result = subprocess.run(
                ['groups', username],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                groups = result.stdout.strip().split()
                return 'sudo' in groups

            return False

        except Exception as e:
            logger.error(f"Error checking sudo user {username}: {e}")
            return False

    def _verify_password(self, username: str, password: str) -> bool:
        """Verify user password using su command"""
        try:
            # Use su to verify password - this is the most reliable method
            try:
                process = subprocess.Popen(
                    ['su', '-c', 'whoami', username],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                stdout, stderr = process.communicate(input=f'{password}\n', timeout=10)
                return process.returncode == 0 and username in stdout
            except subprocess.TimeoutExpired:
                logger.warning(f"Su password verification timed out for {username}")
                return False
            except Exception as e:
                logger.warning(f"Su password verification failed for {username}: {e}")
                return False

        except Exception as e:
            logger.error(f"Password verification error for {username}: {e}")
            return False

    def _get_user_groups(self, username: str) -> list:
        """Get user's groups"""
        try:
            result = subprocess.run(
                ['groups', username],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                return result.stdout.strip().split()[2:]  # Skip username and ':'
            return []

        except Exception as e:
            logger.error(f"Error getting groups for {username}: {e}")
            return []

    def _generate_token(self, username: str) -> str:
        """Generate JWT token"""
        payload = {
            'username': username,
            'groups': self._get_user_groups(username),
            'role': self.get_user_role(username),
            'iat': time.time(),
            'exp': time.time() + self.session_timeout
        }

        return jwt.encode(payload, self.secret_key, algorithm='HS256')

    def refresh_token(self, token: str) -> Optional[str]:
        """Refresh JWT token if valid"""
        user_info = self.verify_token(token)
        if user_info:
            return self._generate_token(user_info['username'])
        return None

    def get_user_role(self, username: str) -> str:
        """Get user role: 'admin', 'readonly', or 'none'"""
        if username in self.admin_users or self._is_sudo_user(username):
            return 'admin'
        elif username in self.readonly_users:
            return 'readonly'
        return 'none'

    def add_admin_user(self, username: str) -> bool:
        """Add user to admin list"""
        if username in self.readonly_users:
            self.readonly_users.remove(username)
        self.admin_users.add(username)
        self._save_delegated_users()
        return True

    def add_readonly_user(self, username: str) -> bool:
        """Add user to readonly list"""
        if username in self.admin_users:
            self.admin_users.remove(username)
        self.readonly_users.add(username)
        self._save_delegated_users()
        return True

    def remove_delegated_user(self, username: str) -> bool:
        """Remove user from delegated admin lists"""
        self.admin_users.discard(username)
        self.readonly_users.discard(username)
        self._save_delegated_users()
        return True

    def get_delegated_users(self) -> Dict[str, list]:
        """Get all delegated administrators"""
        return {
            'admin': list(self.admin_users),
            'readonly': list(self.readonly_users)
        }

    def _load_delegated_users(self):
        """Load delegated users from file"""
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.delegated_users_file), exist_ok=True)

            if os.path.exists(self.delegated_users_file):
                with open(self.delegated_users_file, 'r') as f:
                    data = json.load(f)
                    self.admin_users = set(data.get('admin', []))
                    self.readonly_users = set(data.get('readonly', []))
                logger.info(f"Loaded delegated users from {self.delegated_users_file}")
            else:
                # Initialize empty if file doesn't exist
                self.admin_users = set()
                self.readonly_users = set()
                logger.info("No delegated users file found, starting with empty lists")
        except Exception as e:
            logger.error(f"Error loading delegated users: {e}")
            # Initialize empty on error
            self.admin_users = set()
            self.readonly_users = set()

    def _save_delegated_users(self):
        """Save delegated users to file"""
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.delegated_users_file), exist_ok=True)

            data = {
                'admin': list(self.admin_users),
                'readonly': list(self.readonly_users)
            }

            with open(self.delegated_users_file, 'w') as f:
                json.dump(data, f, indent=2)

            logger.info(f"Saved delegated users to {self.delegated_users_file}")
        except Exception as e:
            logger.error(f"Error saving delegated users: {e}")
            raise