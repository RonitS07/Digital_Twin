from datetime import datetime

def format_datetime(iso_str):
    """Converts 2026-04-26T16:00:00+05:30 to Sunday, April 26 at 4:00 PM"""
    if not iso_str:
        return "TBD"
    try:
        # Remove timezone offset for simple parsing if needed, but here let's try ISO
        # Handle +05:30 suffix which fromisoformat likes
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%A, %b %d • %I:%M %p")
    except Exception:
        return iso_str

def get_proposal_html(sender_name, receiver_name, topic, dashboard_url):
    """Generates a premium HTML email template for a new meeting proposal."""
    return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Inter', sans-serif; color: #1a1926;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f4f6; padding: 60px 20px;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); border: 1px solid rgba(0,0,0,0.05);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 40px; text-align: center;">
                            <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(255,255,255,0.8); margin-bottom: 12px;">Agent Protocol</div>
                            <h2 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.01em;">New Meeting Proposal</h2>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <p style="font-size: 16px; color: #4b5563; margin: 0 0 24px 0;">Hi {receiver_name or 'there'},</p>
                            <p style="font-size: 16px; color: #1f2937; line-height: 1.6; margin: 0 0 32px 0;">
                                <strong>@{sender_name}</strong> has proposed a sync via the AI Twin Network. My agent has identified this as a priority.
                            </p>
                            
                            <div style="background-color: #f9fafb; border-radius: 16px; padding: 24px; margin-bottom: 32px; border: 1px solid #f3f4f6;">
                                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #6366f1; margin-bottom: 8px;">Topic</div>
                                <div style="font-size: 18px; font-weight: 700; color: #111827;">{topic}</div>
                            </div>

                            <div style="text-align: center; margin-bottom: 32px;">
                                <a href="{dashboard_url}" style="display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 10px 20px rgba(99, 102, 241, 0.2);">
                                    View Details & Accept
                                </a>
                            </div>

                            <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0;">
                                You can choose an optimal slot or suggest a change directly from your dashboard.
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px 40px 40px; text-align: center;">
                            <div style="height: 1px; background: #f3f4f6; margin-bottom: 24px;"></div>
                            <div style="font-size: 12px; color: #9ca3af;">
                                Powered by <strong style="color: #6366f1;">AI Twin Intelligence</strong>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""

def get_invite_html(title, start_time, end_time, meet_link, description, user_name, attendees):
    """
    Generates a premium HTML email template based on the Aether Obsidian UI.
    """
    formatted_start = format_datetime(start_time)
    
    attendees_html = "".join([f'<div style="color: #c7c4d8; font-size: 14px; margin-bottom: 6px; padding: 6px 12px; background: rgba(255,255,255,0.05); border-radius: 8px; display: inline-block; margin-right: 4px;">{a}</div>' for a in attendees])
    
    return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meeting Invitation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e4e1ee;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f3f4f6; width: 100%; min-height: 100vh;">
        <tr>
            <td align="center" style="padding: 60px 20px;">
                <!-- Main Card -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background-color: #1a1926; border-radius: 32px; overflow: hidden; border: 1px solid rgba(0,0,0,0.1); box-shadow: 0 40px 80px rgba(0,0,0,0.35);">
                    <!-- Header Section -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #6760fd 0%, #c3c0ff 100%); padding: 40px; text-align: center;">
                            <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(255,255,255,0.85); margin-bottom: 12px;">Meeting Confirmed</div>
                            <h2 style="color: #ffffff; font-size: 26px; font-weight: 800; margin: 0; letter-spacing: -0.02em; line-height: 1.2;">{title}</h2>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <!-- Highlighted Time -->
                            <div style="background-color: rgba(103, 96, 253, 0.1); border-radius: 20px; padding: 24px; margin-bottom: 32px; border: 1px solid rgba(103, 96, 253, 0.2); text-align: center;">
                                <div style="font-size: 18px; font-weight: 800; color: #ffffff; margin-bottom: 4px;">{formatted_start}</div>
                                <div style="font-size: 12px; color: #918fa1; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">India Standard Time</div>
                            </div>

                            <div style="color: #c7c4d8; font-size: 15px; line-height: 1.6; margin-bottom: 32px;">
                                Hello,<br><br>
                                I've successfully scheduled this meeting. You can find the entry link and participants below.
                            </div>

                            <!-- CTA Button -->
                            <div style="text-align: center; margin-bottom: 32px;">
                                <a href="{meet_link}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 18px 48px; border-radius: 16px; font-weight: 800; font-size: 16px; box-shadow: 0 10px 25px rgba(16, 185, 129, 0.3);">
                                    Join Google Meet
                                </a>
                            </div>

                            <div style="text-align: center; margin-bottom: 40px;">
                                <a href="{meet_link}" style="color: #6760fd; font-size: 13px; text-decoration: none; font-family: ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace; font-weight: 600;">{meet_link}</a>
                            </div>

                            <!-- Agenda -->
                            {f'''<div style="background: rgba(255,255,255,0.03); border-radius: 20px; padding: 24px; margin-bottom: 32px; border-left: 4px solid #6760fd;">
                                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #6760fd; margin-bottom: 10px;">Agenda</div>
                                <div style="font-size: 14px; line-height: 1.6; color: #e4e1ee;">{description}</div>
                            </div>''' if description else ''}

                            <!-- Participants -->
                            <div style="margin-bottom: 8px;">
                                <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #918fa1; margin-bottom: 12px;">Participants</div>
                                <div style="margin-top: 8px;">{attendees_html}</div>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 0 40px 40px 40px; text-align: center;">
                            <div style="height: 1px; background: rgba(255,255,255,0.1); margin-bottom: 24px;"></div>
                            <div style="font-size: 11px; color: #777681; line-height: 1.6;">
                                Dispatched by <strong>{user_name}</strong> Personal Twin.<br>
                                <span style="color: #6760fd; font-weight: 600;">Aether Obsidian Intelligence</span>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
