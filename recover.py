import json
import re

LOG_FILE = "/home/ronit.shah/.gemini/antigravity/brain/79d9c319-7cb2-42ab-aa4d-8c9119124243/.system_generated/logs/overview.txt"

def recover_from_logs(filepath):
    print(f"Recovering {filepath}...")
    content = None
    with open(LOG_FILE, 'r') as f:
        for line in f:
            try:
                entry = json.loads(line)
                if entry.get("type") == "TOOL_RESPONSE" and "view_file" in str(entry.get("tool_calls", "")):
                    for call in entry.get("tool_calls", []):
                        if call.get("name") == "view_file":
                            output = call.get("output", "")
                            if filepath in output and "The following code has been modified to include a line number" in output:
                                # Parse the file contents
                                lines = output.split('\n')
                                parsed_lines = []
                                parsing = False
                                for l in lines:
                                    if "The following code has been modified" in l:
                                        parsing = True
                                        continue
                                    if parsing and l.startswith("The above content"):
                                        parsing = False
                                        continue
                                    if parsing:
                                        # Remove line number: "1: import React" -> "import React"
                                        match = re.match(r'^\d+:\s(.*)$', l)
                                        if match:
                                            parsed_lines.append(match.group(1))
                                        elif l == "" or re.match(r'^\d+:$', l):
                                            parsed_lines.append("")
                                if parsed_lines:
                                    content = "\n".join(parsed_lines)
            except Exception as e:
                pass
    if content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Recovered {filepath} ({len(content)} bytes)")
    else:
        print(f"Could not find {filepath} in logs.")

recover_from_logs("/home/ronit.shah/digital_twin/frontend/src/components/Layout.jsx")
recover_from_logs("/home/ronit.shah/digital_twin/frontend/src/components/Dashboard.jsx")
recover_from_logs("/home/ronit.shah/digital_twin/frontend/src/components/IntelligenceHub.jsx")
recover_from_logs("/home/ronit.shah/digital_twin/frontend/src/components/AgentInbox.jsx")
