"""
Config for dynaconf
"""
import os

from dynaconf import Dynaconf

cwd = os.getcwd()

settings = Dynaconf(root_path=cwd, settings_file="settings.toml", environments=True)
