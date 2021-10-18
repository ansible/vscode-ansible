# TextMate grammar authoring

TextMate grammars (which VS Code uses for syntax highlighting) are authored in a
[textual property-list format](https://macromates.com/manual/en/language_grammars).
This format is much easier to work with than its XML, JSON or even YAML
representations.

The two Python scripts `plist2xml.py` and `xml2plist.py` are provided to convert
between the textual and XML representation of the TextMate grammars.
