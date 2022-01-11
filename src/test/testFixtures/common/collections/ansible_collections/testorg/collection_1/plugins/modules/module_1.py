"""
The module file for testorg.collection_1.module_1
"""

from __future__ import absolute_import, division, print_function

__metaclass__ = type


DOCUMENTATION = """
module: module_1
short_description: Test module
description:
  - This is a test module
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
          sub_sub_opt_2:
            description: Sub sub option 2
            type: str
          sub_sub_opt_3:
            description: Sub sub option 3
            type: list
            elements: dict
            suboptions:
              sub_sub_sub_opt_1:
                description: Sub sub sub option 1
                type: int
                required: true
              sub_sub_sub_opt_2:
                description: Sub sub sub option 2
                type: str
              sub_sub_sub_opt_3:
                description: Sub sub sub option 3
                type: str
                choices: ["choice_1", "choice_2"]
              sub_sub_sub_opt_4:
                description: Sub sub sub option 4
                type: int
  opt_2:
    description: Option 2
    type: str
  opt_3:
    description:
      - Option 3
    type: str
    choices:
      - choice_1
      - choice_2
      - choice_3
      - choice_4
    default: choice_1
"""

EXAMPLES = """
    - name: Collection module
      testorg.collection_1.module_1:
        opt_1:
          - sub_opt_1:
            sub_opt_2:

          - sub_opt_1:
            sub_opt_2:
              - sub_sub_opt_1:
                sub_sub_opt_2:
                sub_sub_opt_3:
                  - sub_sub_sub_opt_1:
                    sub_sub_sub_opt_2:

                  - sub_sub_sub_opt_1:
                    sub_sub_sub_opt_2:
"""

RETURN = """
baz:
    description: test return 1
    returned: success
"""
