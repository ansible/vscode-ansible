"""
The module file for org_1.coll_1.module_1
"""

from __future__ import absolute_import, division, print_function

__metaclass__ = type


DOCUMENTATION = """
module: module_1
short_description: Test module
description:
  - This is a test module for playbook adjacent collection
version_added: 1.0.0
author: test
notes:
  - This is a dummy module
options:
  opt_1:
    description: Option 1
    type: list
    elements: dict
    suboptions:
      sub_opt_1:
        description: Sub option 1
        type: str
        choices: ["choice_1", "choice_2"]
        required: true
      sub_opt_2:
        description: Sub option 2
        type: list
        elements: dict
        suboptions:
          sub_sub_opt_1:
            description: Sub sub option 1
            type: str
            required: true
"""

EXAMPLES = """
    - name: Collection module
      org_1.coll_1.module_1:
        opt_1:
          - sub_opt_1:
            sub_opt_2:

          - sub_opt_1:
            sub_opt_2:
              - sub_sub_opt_1:
"""

RETURN = """
baz:
    description: test return 1
    returned: success
"""
