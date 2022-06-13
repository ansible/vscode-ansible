#!/usr/bin/env python

'''
Example custom dynamic inventory script for Ansible, in Python.
'''

import argparse
from time import sleep

try:
    import json
except ImportError:
    import simplejson as json

class ExampleInventory(object):

    def __init__(self):
        self.inventory = {}
        self.read_cli_args()

        # Called with `--list`.
        if self.args.list:
            self.inventory = self.example_inventory()
        # Called with `--host [hostname]`.
        elif self.args.host:
            # Not implemented, since we return _meta info `--list`.
            self.inventory = self.empty_inventory()
        # If no groups or vars are present, return an empty inventory.
        else:
            self.inventory = self.empty_inventory()

        print (json.dumps(self.inventory));

    # Example inventory for testing.
    def example_inventory(self):
        sleep(1)
        return {
            'python_hosts': {
                'hosts': ['10.220.21.24', '10.220.21.27'],
                'vars': {
                    'ansible_ssh_user': 'projectuser',
                }
            },
            '_meta': {
                'hostvars': {
                    '10.220.21.24': {
                        'host_specific_var': 'testhost'
                    },
                    '10.220.21.27': {
                        'host_specific_var': 'towerhost'
                    }
                }
            }
        }

    # Empty inventory for testing.
    def empty_inventory(self):
        return {'_meta': {'hostvars': {}}}

    # Read the command line args passed to the script.
    def read_cli_args(self):
        parser = argparse.ArgumentParser()
        parser.add_argument('--list', action = 'store_true')
        parser.add_argument('--host', action = 'store')
        self.args = parser.parse_args()

# Get the inventory.
ExampleInventory()
