import { anthropicOptions } from '@/lib/ai-provider';
import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const anthropic = new Anthropic(anthropicOptions());

const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Tool definitions for the connected services
const tools: Anthropic.Tool[] = [
  {
    name: 'search_zoho_crm',
    description: 'Search for leads and contacts in Zoho CRM. Returns contact information including name, email, company, and account manager.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "webinar attendees", "recent leads")',
        },
        filters: {
          type: 'object',
          description: 'Additional filters like date range, status, etc.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_zoho_desk_status',
    description: 'Check support ticket status for a contact in Zoho Desk. Returns ticket information including status, priority, and response details.',
    input_schema: {
      type: 'object',
      properties: {
        contact_email: {
          type: 'string',
          description: 'Email address of the contact to check',
        },
        contact_name: {
          type: 'string',
          description: 'Name of the contact',
        },
      },
      required: ['contact_email'],
    },
  },
  {
    name: 'schedule_google_calendar_meeting',
    description: 'Schedule a meeting in Google Calendar. Creates a calendar event and sends invitations.',
    input_schema: {
      type: 'object',
      properties: {
        attendee_email: {
          type: 'string',
          description: 'Email address of the attendee',
        },
        attendee_name: {
          type: 'string',
          description: 'Name of the attendee',
        },
        date: {
          type: 'string',
          description: 'Date for the meeting (e.g., "tomorrow", "next Tuesday")',
        },
        time: {
          type: 'string',
          description: 'Time for the meeting (e.g., "2:30 PM", "14:30")',
        },
        duration: {
          type: 'number',
          description: 'Duration in minutes',
          default: 30,
        },
      },
      required: ['attendee_email', 'attendee_name', 'date', 'time'],
    },
  },
  {
    name: 'send_slack_message',
    description: 'Send a message or summary to a Slack channel or user. Used for notifications and updates.',
    input_schema: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Slack channel (e.g., "#sales") or user to send message to',
        },
        message: {
          type: 'string',
          description: 'The message content to send',
        },
        format: {
          type: 'string',
          enum: ['text', 'summary', 'report'],
          description: 'Message format type',
          default: 'text',
        },
      },
      required: ['recipient', 'message'],
    },
  },
  {
    name: 'send_password_reset_resources',
    description: 'Send KB article, video tutorial, and password reset link to user for self-help resolution.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address for password reset',
        },
        ticket_id: {
          type: 'string',
          description: 'Associated support ticket ID',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'escalate_to_jira',
    description: 'Create Jira issue for human agent assignment and notify CS team via email + SMS.',
    input_schema: {
      type: 'object',
      properties: {
        ticket_id: {
          type: 'string',
          description: 'Ticket ID to escalate',
        },
        reason: {
          type: 'string',
          description: 'Reason for escalation (e.g., "User unable to reset password after AI self-help")',
        },
        user_email: {
          type: 'string',
          description: 'User email address',
        },
      },
      required: ['ticket_id', 'reason'],
    },
  },
  {
    name: 'verify_account_status',
    description: 'Verify user account status and check for security flags or lock reasons.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address to verify',
        },
        user_id: {
          type: 'string',
          description: 'User ID (optional)',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'unlock_account_automatically',
    description: 'Automatically unlock user account after verification. Only use if no severe security flags detected.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address',
        },
        ticket_id: {
          type: 'string',
          description: 'Associated support ticket ID',
        },
        reason: {
          type: 'string',
          description: 'Reason account was locked (e.g., "5 failed login attempts")',
        },
      },
      required: ['email', 'ticket_id'],
    },
  },
  {
    name: 'check_multi_system_access',
    description: 'Check user access to multiple systems (SharePoint, Slack, Email, etc.) and identify any issues.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address',
        },
        systems: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of systems to check (e.g., ["sharepoint", "slack", "email"])',
        },
      },
      required: ['email', 'systems'],
    },
  },
  {
    name: 'fix_sharepoint_access',
    description: 'Automatically fix SharePoint access issues (add to group, assign license, reset permissions).',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address',
        },
        issue_type: {
          type: 'string',
          description: 'Type of issue (permission, license, group)',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'get_user_profile',
    description: 'Get current user profile information including name, email, phone, location, department, and title.',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address',
        },
        user_id: {
          type: 'string',
          description: 'User ID (optional)',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'update_user_profile',
    description: 'Update user profile information. Can automatically update basic fields (name, phone, location) but requires approval for sensitive fields (department, title).',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address',
        },
        updates: {
          type: 'object',
          description: 'Fields to update (e.g., {"phone": "+1-555-9999", "location": "New York, NY"})',
        },
        ticket_id: {
          type: 'string',
          description: 'Associated support ticket ID',
        },
      },
      required: ['email', 'updates', 'ticket_id'],
    },
  },
  {
    name: 'get_course_details',
    description: 'Get current course information including name, description, schedule, instructor, and classroom.',
    input_schema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'string',
          description: 'Course ID',
        },
        course_name: {
          type: 'string',
          description: 'Course name (if ID not available)',
        },
      },
      required: [],
    },
  },
  {
    name: 'update_course_details',
    description: 'Update course information. Can automatically update basic fields (name, description, schedule, classroom) but requires department chair approval for instructor changes.',
    input_schema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'string',
          description: 'Course ID',
        },
        updates: {
          type: 'object',
          description: 'Fields to update (e.g., {"name": "Advanced JavaScript", "classroom": "Building A, Room 305"})',
        },
        ticket_id: {
          type: 'string',
          description: 'Associated support ticket ID',
        },
      },
      required: ['course_id', 'updates', 'ticket_id'],
    },
  },
  {
    name: 'fix_slack_access',
    description: 'Automatically fix Slack access issues (reactivate account, refresh SSO token, add to channels).',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address',
        },
        issue_type: {
          type: 'string',
          description: 'Type of issue (deactivated, sso, permissions)',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'fix_email_access',
    description: 'Automatically fix email access issues (expand quota, archive old emails, fix mailbox corruption).',
    input_schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User email address',
        },
        issue_type: {
          type: 'string',
          description: 'Type of issue (quota, corruption, permissions)',
        },
      },
      required: ['email'],
    },
  },
  // V17 Government Mode Tools
  {
    name: 'get_contract_performance',
    description: 'Get performance metrics for a government contract including SLA compliance, deliverable status, and budget utilization.',
    input_schema: {
      type: 'object',
      properties: {
        contract_id: {
          type: 'string',
          description: 'Contract ID (e.g., CON-2025-042)',
        },
        include_deliverables: {
          type: 'boolean',
          description: 'Include detailed deliverable information',
          default: true,
        },
      },
      required: ['contract_id'],
    },
  },
  {
    name: 'approve_deliverable',
    description: 'Approve a contract deliverable after review. COR persona can approve deliverables directly.',
    input_schema: {
      type: 'object',
      properties: {
        deliverable_id: {
          type: 'string',
          description: 'Deliverable ID to approve',
        },
        contract_id: {
          type: 'string',
          description: 'Associated contract ID',
        },
        quality_score: {
          type: 'number',
          description: 'Quality score (1-100)',
        },
        feedback: {
          type: 'string',
          description: 'Optional feedback for vendor',
        },
      },
      required: ['deliverable_id', 'contract_id', 'quality_score'],
    },
  },
  {
    name: 'escalate_vendor_issue',
    description: 'Escalate a vendor compliance or performance issue to program manager.',
    input_schema: {
      type: 'object',
      properties: {
        vendor_id: {
          type: 'string',
          description: 'Vendor ID',
        },
        contract_id: {
          type: 'string',
          description: 'Contract ID',
        },
        issue_type: {
          type: 'string',
          enum: ['sla_breach', 'quality', 'budget', 'timeline'],
          description: 'Type of issue to escalate',
        },
        description: {
          type: 'string',
          description: 'Issue description',
        },
      },
      required: ['vendor_id', 'contract_id', 'issue_type', 'description'],
    },
  },
  {
    name: 'schedule_stakeholder_meeting',
    description: 'Schedule a stakeholder engagement meeting with agenda and materials.',
    input_schema: {
      type: 'object',
      properties: {
        stakeholders: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of stakeholder emails',
        },
        topic: {
          type: 'string',
          description: 'Meeting topic',
        },
        date: {
          type: 'string',
          description: 'Meeting date (e.g., "next Tuesday")',
        },
        duration: {
          type: 'number',
          description: 'Duration in minutes',
          default: 60,
        },
      },
      required: ['stakeholders', 'topic', 'date'],
    },
  },
  {
    name: 'update_requirement_status',
    description: 'Update the status of a program requirement in requirements tracking system.',
    input_schema: {
      type: 'object',
      properties: {
        requirement_id: {
          type: 'string',
          description: 'Requirement ID',
        },
        status: {
          type: 'string',
          enum: ['draft', 'approved', 'in_progress', 'completed', 'verified'],
          description: 'New requirement status',
        },
        notes: {
          type: 'string',
          description: 'Status update notes',
        },
      },
      required: ['requirement_id', 'status'],
    },
  },
  // V17 Project Mode Tools
  {
    name: 'update_sprint_task',
    description: 'Update the status of a task in the current sprint.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Task ID',
        },
        status: {
          type: 'string',
          enum: ['todo', 'in-progress', 'review', 'done'],
          description: 'New task status',
        },
        assignee: {
          type: 'string',
          description: 'Assign to team member (optional)',
        },
        story_points: {
          type: 'number',
          description: 'Story points (optional)',
        },
      },
      required: ['task_id', 'status'],
    },
  },
  {
    name: 'trigger_deployment',
    description: 'Trigger a deployment to specified environment (dev/staging/production).',
    input_schema: {
      type: 'object',
      properties: {
        environment: {
          type: 'string',
          enum: ['dev', 'staging', 'production'],
          description: 'Target deployment environment',
        },
        branch: {
          type: 'string',
          description: 'Git branch to deploy (e.g., "main", "release/v2.1")',
        },
        run_tests: {
          type: 'boolean',
          description: 'Run test suite before deployment',
          default: true,
        },
      },
      required: ['environment', 'branch'],
    },
  },
  {
    name: 'resolve_blocker',
    description: 'Mark a blocker as resolved and update affected tasks.',
    input_schema: {
      type: 'object',
      properties: {
        blocker_id: {
          type: 'string',
          description: 'Blocker ID',
        },
        resolution: {
          type: 'string',
          description: 'How the blocker was resolved',
        },
        affected_tasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of task IDs to unblock',
        },
      },
      required: ['blocker_id', 'resolution'],
    },
  },
  {
    name: 'run_code_quality_scan',
    description: 'Trigger a code quality scan and return results (coverage, complexity, vulnerabilities).',
    input_schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['full', 'changed-files', 'critical-only'],
          description: 'Scan scope',
          default: 'full',
        },
        include_tests: {
          type: 'boolean',
          description: 'Include test files in scan',
          default: true,
        },
      },
      required: [],
    },
  },
  {
    name: 'assign_task_to_team',
    description: 'Assign a task to a team member based on capacity and skills.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'Task ID to assign',
        },
        assignee: {
          type: 'string',
          description: 'Team member to assign (email or name)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Task priority',
        },
      },
      required: ['task_id', 'assignee'],
    },
  },
];

// Mock tool execution for demo purposes
function executeTool(toolName: string, toolInput: Record<string, unknown>) {
  // Simulate different responses based on tool
  switch (toolName) {
    case 'search_zoho_crm':
      return {
        results: [
          {
            name: 'Sarah Johnson',
            email: 'sarah.johnson@techcorp.com',
            company: 'TechCorp Solutions',
            account_manager: 'Mike Chen',
            source: 'Q4 Product Webinar',
          },
          {
            name: 'David Martinez',
            email: 'david.m@innovatestart.io',
            company: 'InnovateStart',
            account_manager: 'Emma Wilson',
            source: 'Q4 Product Webinar',
          },
          {
            name: 'Lisa Chen',
            email: 'l.chen@bizgrowth.com',
            company: 'BizGrowth Inc',
            account_manager: 'Mike Chen',
            source: 'Q4 Product Webinar',
          },
        ],
        count: 3,
      };

    case 'check_zoho_desk_status':
      const hasResponse = Math.random() > 0.4;
      return {
        contact_email: toolInput.contact_email,
        contact_name: toolInput.contact_name,
        has_ticket: true,
        ticket_status: hasResponse ? 'Responded' : 'No response',
        last_contact: hasResponse ? '1 day ago' : '3 days ago',
        responded: hasResponse,
      };

    case 'schedule_google_calendar_meeting':
      return {
        success: true,
        meeting_id: 'meet_' + Math.random().toString(36).substr(2, 9),
        scheduled_time: toolInput.time + ' IST ' + toolInput.date,
        attendee: toolInput.attendee_name,
        attendee_email: toolInput.attendee_email,
      };

    case 'send_slack_message':
      return {
        success: true,
        channel: toolInput.recipient,
        message_sent: true,
        timestamp: new Date().toISOString(),
      };

    case 'send_password_reset_resources':
      return {
        success: true,
        resources_sent: true,
        email: toolInput.email,
        ticket_id: toolInput.ticket_id || 'TICK-2847',
        kb_article: 'KB-1847: How to Reset Your Password',
        video_url: 'https://youtube.com/watch?v=password-reset-demo',
        reset_link: 'https://app.auzmor.com/reset-password',
        timestamp: new Date().toISOString(),
      };

    case 'escalate_to_jira':
      return {
        success: true,
        jira_issue_created: true,
        jira_issue_key: 'JIRA-5621',
        jira_url: 'https://auzmor.atlassian.net/browse/JIRA-5621',
        assigned_to: 'Sarah Chen (Senior Support Agent)',
        notifications_sent: {
          email: true,
          sms: true,
          email_recipients: ['cs-team@auzmor.com', 's.chen@auzmor.com'],
          sms_recipients: ['+1-555-0123'],
        },
        ticket_status: 'Escalated',
        expected_response_time: '15 minutes',
        timestamp: new Date().toISOString(),
      };

    case 'verify_account_status':
      return {
        success: true,
        email: toolInput.email,
        account_status: 'locked',
        lock_reason: '5 failed login attempts',
        locked_at: '2025-10-07T09:23:14Z',
        security_flags: [],
        can_auto_unlock: true,
        verification_passed: true,
      };

    case 'unlock_account_automatically':
      return {
        success: true,
        account_unlocked: true,
        email: toolInput.email,
        ticket_id: toolInput.ticket_id,
        unlocked_at: new Date().toISOString(),
        lock_reason: toolInput.reason || '5 failed login attempts',
        next_steps: [
          'Clear browser cache and cookies',
          'Log in using current credentials',
          'Enable two-factor authentication (recommended)',
        ],
      };

    case 'check_multi_system_access':
      return {
        success: true,
        email: toolInput.email,
        systems_checked: toolInput.systems,
        results: [
          {
            system: 'SharePoint',
            status: 'issue_detected',
            issue: 'User not in Marketing Team group',
            can_auto_fix: true,
          },
          {
            system: 'Slack',
            status: 'issue_detected',
            issue: 'Account deactivated (30 days idle)',
            can_auto_fix: true,
          },
          {
            system: 'Email',
            status: 'issue_detected',
            issue: 'Mailbox quota exceeded (100% full)',
            can_auto_fix: true,
          },
        ],
      };

    case 'fix_sharepoint_access':
      return {
        success: true,
        system: 'SharePoint',
        fixed: true,
        email: toolInput.email,
        action_taken: 'Added user to Marketing Team group with Contributor permissions',
        details: {
          group: 'Marketing Team',
          permission_level: 'Contributor',
          applied_in: '5 seconds',
        },
      };

    case 'fix_slack_access':
      return {
        success: true,
        system: 'Slack',
        fixed: true,
        email: toolInput.email,
        action_taken: 'Reactivated Slack account and restored workspace access',
        details: {
          workspace: 'Company Workspace',
          channels_restored: 12,
          messages_preserved: true,
        },
      };

    case 'fix_email_access':
      return {
        success: true,
        system: 'Email',
        fixed: true,
        email: toolInput.email,
        action_taken: 'Archived emails older than 90 days to archive mailbox',
        details: {
          emails_archived: 3847,
          space_freed: '15GB',
          new_usage: '35GB/50GB (70%)',
        },
      };

    case 'get_user_profile':
      return {
        success: true,
        email: toolInput.email,
        profile: {
          name: 'John Doe',
          email: 'john.doe@company.com',
          phone: '+1-555-0123',
          location: 'San Francisco, CA',
          department: 'Marketing',
          title: 'Marketing Manager',
          manager: 'Jane Smith',
          employee_id: 'EMP-10291',
          hire_date: '2018-03-15',
        },
      };

    case 'update_user_profile':
      const updates = toolInput.updates as Record<string, string>;
      const sensitiveFields = ['department', 'title', 'manager'];
      const requiresApproval = Object.keys(updates).some(field =>
        sensitiveFields.includes(field)
      );

      if (requiresApproval) {
        return {
          success: false,
          requires_approval: true,
          email: toolInput.email,
          ticket_id: toolInput.ticket_id,
          requested_changes: updates,
          approval_required_for: Object.keys(updates).filter(field =>
            sensitiveFields.includes(field)
          ),
          assigned_to: {
            name: 'Jane Smith',
            role: 'Department Manager',
            email: 'jane.smith@company.com',
          },
          message: 'These changes require manager approval due to organizational impact.',
        };
      }

      return {
        success: true,
        email: toolInput.email,
        ticket_id: toolInput.ticket_id,
        updated_fields: Object.keys(updates).map(field => ({
          field,
          old_value: field === 'phone' ? '+1-555-0123' : field === 'location' ? 'San Francisco, CA' : 'Current Value',
          new_value: updates[field],
        })),
        message: 'Profile updated successfully! Changes are live and synced across all systems.',
        timestamp: new Date().toISOString(),
      };

    case 'get_course_details':
      return {
        success: true,
        course_id: toolInput.course_id || 'CS-301',
        course: {
          name: 'Introduction to JavaScript',
          description: 'Learn the fundamentals of JavaScript programming',
          instructor: 'Dr. Emily Rodriguez',
          schedule: 'Mon/Wed 2:00 PM - 3:30 PM',
          classroom: 'Building B, Room 205',
          semester: 'Fall 2025',
          credits: 3,
          enrollment: 28,
          capacity: 30,
        },
      };

    case 'update_course_details':
      const courseUpdates = toolInput.updates as Record<string, string>;
      const sensitiveFieldsCourse = ['instructor'];
      const requiresApprovalCourse = Object.keys(courseUpdates).some(field =>
        sensitiveFieldsCourse.includes(field)
      );

      if (requiresApprovalCourse) {
        return {
          success: false,
          requires_approval: true,
          course_id: toolInput.course_id,
          ticket_id: toolInput.ticket_id,
          requested_changes: courseUpdates,
          approval_required_for: Object.keys(courseUpdates).filter(field =>
            sensitiveFieldsCourse.includes(field)
          ),
          assigned_to: {
            name: 'Dr. Michael Thompson',
            role: 'Department Chair - Computer Science',
            email: 'm.thompson@university.edu',
          },
          message: 'Instructor changes require department chair approval.',
        };
      }

      return {
        success: true,
        course_id: toolInput.course_id,
        ticket_id: toolInput.ticket_id,
        updated_fields: Object.keys(courseUpdates).map(field => ({
          field,
          old_value: field === 'name' ? 'Introduction to JavaScript' : field === 'classroom' ? 'Building B, Room 205' : 'Current Value',
          new_value: courseUpdates[field],
        })),
        message: 'Course updated successfully! Changes are visible to all enrolled students.',
        timestamp: new Date().toISOString(),
      };

    // V17 Government Mode Tool Responses
    case 'get_contract_performance':
      return {
        success: true,
        contract_id: toolInput.contract_id,
        contract: {
          name: 'Enterprise IT Infrastructure Modernization',
          vendor: 'TechSolutions Inc.',
          vendor_id: 'VEND-1523',
        },
        performance: {
          overall_score: 87,
          sla_compliance: 92,
          budget_utilization: 78,
          deliverable_completion: 85,
        },
        financials: {
          total_value: 2500000,
          spent: 1950000,
          committed: 350000,
          remaining: 200000,
        },
        deliverables: toolInput.include_deliverables ? [
          {
            id: 'DEL-042-001',
            name: 'Q4 Security Audit Report',
            due_date: '2025-11-15',
            status: 'pending',
            quality_score: null,
          },
          {
            id: 'DEL-042-002',
            name: 'Infrastructure Migration Plan',
            due_date: '2025-10-28',
            status: 'approved',
            quality_score: 92,
          },
        ] : [],
        issues: [
          {
            severity: 'high',
            description: 'Q4 Security Audit deliverable delayed by 3 days',
            due_date: '2025-11-13',
            assigned_to: 'COR',
          },
        ],
      };

    case 'approve_deliverable':
      return {
        success: true,
        deliverable_id: toolInput.deliverable_id,
        contract_id: toolInput.contract_id,
        status: 'approved',
        quality_score: toolInput.quality_score,
        approved_at: new Date().toISOString(),
        approved_by: 'Alexa Johnson (COR)',
        feedback: toolInput.feedback || 'Deliverable meets all acceptance criteria.',
        next_steps: [
          'Vendor notified of approval',
          'Payment milestone triggered ($125,000)',
          'Next deliverable: Infrastructure Migration Plan (Due: Nov 28)',
        ],
      };

    case 'escalate_vendor_issue':
      return {
        success: true,
        escalation_id: 'ESC-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        vendor_id: toolInput.vendor_id,
        contract_id: toolInput.contract_id,
        issue_type: toolInput.issue_type,
        escalated_to: 'Marcus Thompson (Program Manager)',
        priority: 'high',
        notifications_sent: {
          program_manager: true,
          vendor: true,
          contracting_office: true,
        },
        sla: {
          response_due: '2025-11-13T14:00:00Z',
          resolution_due: '2025-11-15T17:00:00Z',
        },
        message: 'Issue escalated successfully. Program Manager will review within 2 business days.',
      };

    case 'schedule_stakeholder_meeting':
      return {
        success: true,
        meeting_id: 'MTG-' + Math.random().toString(36).substr(2, 8),
        topic: toolInput.topic,
        date: toolInput.date,
        duration: toolInput.duration || 60,
        stakeholders: toolInput.stakeholders,
        calendar_link: 'https://calendar.google.com/calendar/event?eid=abc123',
        agenda_prepared: true,
        materials: [
          'Stakeholder Engagement Status Report',
          'Program Health Dashboard',
          'Action Items Tracking Sheet',
        ],
        reminder_sent: true,
      };

    case 'update_requirement_status':
      return {
        success: true,
        requirement_id: toolInput.requirement_id,
        old_status: 'in_progress',
        new_status: toolInput.status,
        updated_at: new Date().toISOString(),
        updated_by: 'Jennifer Martinez (Stakeholder Lead)',
        notes: toolInput.notes || 'Status updated successfully.',
        affected_deliverables: 2,
        next_review: '2025-11-20',
      };

    // V17 Project Mode Tool Responses
    case 'update_sprint_task':
      return {
        success: true,
        task_id: toolInput.task_id,
        old_status: 'todo',
        new_status: toolInput.status,
        assignee: toolInput.assignee || 'Current assignee',
        story_points: toolInput.story_points,
        sprint: 'Sprint 24 - Q4 Features',
        updated_at: new Date().toISOString(),
        burndown_impact: toolInput.status === 'done' ? 'Decreased remaining points by 5' : 'No change',
        notifications_sent: ['Slack', 'Email'],
      };

    case 'trigger_deployment':
      return {
        success: true,
        deployment_id: 'DEPLOY-' + Math.random().toString(36).substr(2, 8).toUpperCase(),
        environment: toolInput.environment,
        branch: toolInput.branch,
        status: 'running',
        tests_passed: toolInput.run_tests ? true : null,
        estimated_completion: '5 minutes',
        pipeline_url: 'https://github.com/company/repo/actions/runs/123456',
        stages: [
          { name: 'Build', status: 'completed', duration: '2m 15s' },
          { name: 'Test', status: toolInput.run_tests ? 'completed' : 'skipped', duration: '1m 30s' },
          { name: 'Deploy', status: 'running', duration: 'in progress' },
        ],
        message: `Deploying ${toolInput.branch} to ${toolInput.environment}. Check pipeline for live updates.`,
      };

    case 'resolve_blocker':
      const affectedTasks = (toolInput.affected_tasks as string[]) || [];
      return {
        success: true,
        blocker_id: toolInput.blocker_id,
        status: 'resolved',
        resolution: toolInput.resolution,
        resolved_at: new Date().toISOString(),
        resolved_by: 'Sarah Kim (Service Team Lead)',
        affected_tasks: affectedTasks,
        tasks_unblocked: affectedTasks.length || 3,
        velocity_impact: '+8 story points now available for sprint',
        notifications_sent: ['Project Manager', 'Service Team Members'],
      };

    case 'run_code_quality_scan':
      return {
        success: true,
        scan_id: 'SCAN-' + Date.now(),
        scope: toolInput.scope || 'full',
        status: 'completed',
        results: {
          coverage: {
            overall: 87.3,
            changed_files: 92.1,
            trend: 'improving',
          },
          complexity: {
            average_cyclomatic: 8.2,
            high_complexity_files: 3,
            threshold: 10,
          },
          vulnerabilities: {
            critical: 0,
            high: 2,
            medium: 5,
            low: 8,
          },
          code_smells: 12,
          duplications: 4.2,
        },
        recommendations: [
          'Fix 2 high-severity vulnerabilities in auth module',
          'Reduce complexity in UserService.ts (cyclomatic = 15)',
          'Increase test coverage for API routes to 90%+',
        ],
        report_url: 'https://sonarcloud.io/dashboard?id=company-repo',
      };

    case 'assign_task_to_team':
      return {
        success: true,
        task_id: toolInput.task_id,
        assignee: toolInput.assignee,
        priority: toolInput.priority,
        assigned_at: new Date().toISOString(),
        capacity_check: {
          current_workload: 32,
          max_capacity: 40,
          available_points: 8,
          status: 'has_capacity',
        },
        estimated_completion: '2025-11-14',
        notifications: {
          assignee: true,
          project_manager: true,
          slack_channel: '#dev-team',
        },
        message: `Task assigned to ${toolInput.assignee}. They have capacity for 8 more story points this sprint.`,
      };

    default:
      return { error: 'Unknown tool' };
  }
}

// Helper to generate realistic relative timestamps
function generateRelativeTimestamp(value: number, unit: 'seconds' | 'minutes' | 'hours'): string {
  const now = new Date();
  let milliseconds = 0;

  switch (unit) {
    case 'seconds':
      milliseconds = value * 1000;
      break;
    case 'minutes':
      milliseconds = value * 60 * 1000;
      break;
    case 'hours':
      milliseconds = value * 60 * 60 * 1000;
      break;
  }

  const targetTime = new Date(now.getTime() - milliseconds);
  const diff = now.getTime() - targetTime.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  } else if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  } else {
    return seconds === 1 ? '1 second ago' : `${seconds} seconds ago`;
  }
}

// Instant demo responses for common queries
function getDemoResponse(userMessage: string): string {
  const messageLower = userMessage.toLowerCase();

  // Admin System Health Queries
  if (messageLower.includes('system health') || messageLower.includes('performance metrics')) {
    // Generate dynamic timestamps for alerts
    const alerts = [
      {"level": "critical", "message": "Database connection pool nearing capacity (85%)", "timestamp": generateRelativeTimestamp(2, 'minutes')},
      {"level": "warning", "message": "API rate limit approaching threshold for user group A", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "warning", "message": "Disk space low on backup server (88% used)", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Scheduled maintenance in 4 hours", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "critical", "message": "Elasticsearch cluster health: yellow", "timestamp": generateRelativeTimestamp(45, 'minutes')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏥 SYSTEM HEALTH & PERFORMANCE OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Quick Summary:
  ✅ System Uptime: 99.8% (+0.2% from last week)
  ⚡ Avg Response: 142ms (8ms faster - excellent!)
  👥 Active Users: 847 (+23 users today)
  ⚠️  Critical Alerts: 5 items need attention

DASHBOARD_DATA:
{
  "type": "system-health",
  "metrics": [
    {"label": "System Uptime", "value": "99.8%", "status": "success", "icon": "Activity", "change": "+0.2%", "trend": "up"},
    {"label": "Active Users", "value": "847", "status": "info", "icon": "Users", "change": "+23", "trend": "up"},
    {"label": "Avg Response Time", "value": "142ms", "status": "success", "icon": "Zap", "change": "-8ms", "trend": "down"},
    {"label": "Critical Alerts", "value": "5", "status": "warning", "icon": "AlertTriangle", "change": "+2", "trend": "up"},
    {"label": "CPU Usage", "value": "42%", "status": "success", "icon": "Activity", "change": "-3%", "trend": "down"},
    {"label": "Memory Usage", "value": "68%", "status": "info", "icon": "Target", "change": "+2%", "trend": "up"},
    {"label": "API Requests/min", "value": "1.2K", "status": "success", "icon": "TrendingUp", "change": "+15%", "trend": "up"},
    {"label": "Error Rate", "value": "0.12%", "status": "success", "icon": "AlertCircle", "change": "-0.03%", "trend": "down"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 Overall Status: ✅ Operational (5 alerts pending)
🎯 Top Priority: Database connection pool at 85% capacity
💡 Recommendation: Review infrastructure scaling for Q1 2026`;
  }

  // Integration Status Queries
  if (messageLower.includes('integration') && (messageLower.includes('attention') || messageLower.includes('status') || messageLower.includes('health') || messageLower.includes('need'))) {
    const alerts = [
      {"level": "critical", "message": "Zoho Desk API experiencing timeouts - affects ticket sync", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "warning", "message": "Zoho CRM rate limit at 85% - may throttle soon", "timestamp": generateRelativeTimestamp(12, 'minutes')},
      {"level": "warning", "message": "Jira API rate limit reached - next reset in 23 minutes", "timestamp": generateRelativeTimestamp(18, 'minutes')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 INTEGRATIONS STATUS DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  System Health: DEGRADED (2 integrations need attention)

📊 Integration Summary:
  ✅ Operational: 3 services (Calendar, Slack, Email)
  ⚠️  Warning: 2 services (Zoho CRM, Jira)
  🔴 Critical: 1 service (Zoho Desk - API timeout)

DASHBOARD_DATA:
{
  "type": "integrations-status",
  "metrics": [
    {"label": "Zoho CRM", "value": "Warning", "status": "warning", "icon": "Database", "change": "2 issues", "trend": "stable", "uptime": "99.2%", "lastSync": "2 mins ago"},
    {"label": "Zoho Desk", "value": "Critical", "status": "error", "icon": "Headphones", "change": "API timeout", "trend": "down", "uptime": "94.1%", "lastSync": "Failed"},
    {"label": "Google Calendar", "value": "Operational", "status": "success", "icon": "Calendar", "change": "All synced", "trend": "up", "uptime": "100%", "lastSync": "Just now"},
    {"label": "Slack", "value": "Operational", "status": "success", "icon": "MessageSquare", "change": "Connected", "trend": "stable", "uptime": "99.9%", "lastSync": "30 sec ago"},
    {"label": "Jira", "value": "Warning", "status": "warning", "icon": "GitBranch", "change": "Rate limit", "trend": "stable", "uptime": "98.5%", "lastSync": "5 mins ago"},
    {"label": "Email SMTP", "value": "Operational", "status": "success", "icon": "Mail", "change": "Healthy", "trend": "up", "uptime": "100%", "lastSync": "1 min ago"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 URGENT ACTION REQUIRED:
  🔴 Zoho Desk: API timeout - check credentials & network
  ⚠️  Jira: Rate limit at 85% - resets in 23 minutes
  ⚠️  Zoho CRM: Rate limit approaching threshold

💡 Next Steps: Restart Zoho Desk connector, verify API keys`;
  }

  // Security Audit Dashboard
  if (messageLower.includes('security') && (messageLower.includes('audit') || messageLower.includes('24') || messageLower.includes('hour') || messageLower.includes('log'))) {
    const alerts = [
      {"level": "critical", "message": "3 failed login attempts from IP 45.142.212.61 (Russia) - possible brute force", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "warning", "message": "Unusual login time detected: Admin account accessed at 3:47 AM", "timestamp": generateRelativeTimestamp(4, 'hours')},
      {"level": "warning", "message": "API key 'prod-key-2891' used from new location (Singapore)", "timestamp": generateRelativeTimestamp(8, 'hours')},
      {"level": "info", "message": "MFA enrollment increased by 12 users today", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️  SECURITY AUDIT REPORT (Last 24 Hours)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 Security Score: A- (92/100)
⚠️  Threat Level: MEDIUM (3 alerts require attention)

📊 24-Hour Activity Summary:
  ✅ Total Logins: 1,247 (+8.3% from yesterday)
  🔴 Failed Attempts: 23 (+15 - investigate spike)
  🔒 MFA Coverage: 94.2% (12 new enrollments today)
  🚨 Suspicious IPs: 5 detected (3 blocked automatically)

DASHBOARD_DATA:
{
  "type": "security-audit",
  "metrics": [
    {"label": "Total Logins", "value": "1,247", "status": "success", "icon": "Shield", "change": "+8.3%", "trend": "up"},
    {"label": "Failed Attempts", "value": "23", "status": "warning", "icon": "AlertOctagon", "change": "+15", "trend": "up"},
    {"label": "MFA Enabled", "value": "94.2%", "status": "success", "icon": "Lock", "change": "+2.1%", "trend": "up"},
    {"label": "Suspicious IPs", "value": "5", "status": "warning", "icon": "Globe", "change": "3 blocked", "trend": "stable"},
    {"label": "API Key Usage", "value": "Safe", "status": "success", "icon": "Key", "change": "All valid", "trend": "stable"},
    {"label": "Session Hijacks", "value": "0", "status": "success", "icon": "ShieldCheck", "change": "No threats", "trend": "stable"},
    {"label": "Privilege Escalations", "value": "2", "status": "warning", "icon": "TrendingUp", "change": "Under review", "trend": "stable"},
    {"label": "Security Score", "value": "A-", "status": "success", "icon": "Award", "change": "92/100", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 IMMEDIATE ACTIONS:
  🔴 Block IP 45.142.212.61 (Russia) - 3 brute force attempts
  ⚠️  Review admin login at 3:47 AM - unusual timing
  ⚠️  Verify API key usage from Singapore (new location)

💡 Recommendations: Enable geo-blocking for high-risk regions, enforce MFA for all admin accounts`;
  }

  // Agent Performance Leaderboard
  if ((messageLower.includes('agent') || messageLower.includes('team')) && (messageLower.includes('performance') || messageLower.includes('this week') || messageLower.includes('metrics'))) {
    const alerts = [
      {"level": "info", "message": "Sarah Martinez achieved 100% CSAT score this week (12 tickets)", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "warning", "message": "Tom Wilson's response time increased by 45% - recommend 1-on-1 coaching", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "Team resolved 23% more tickets than last week", "timestamp": generateRelativeTimestamp(4, 'hours')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 AGENT PERFORMANCE LEADERBOARD (This Week)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Team Performance: +23% more tickets than last week
⭐ Team CSAT Average: 4.6/5.0

🥇 Top Performers:
  1️⃣  Sarah Martinez - 98 pts (42 tickets, 4.2h avg, 100% CSAT)
  2️⃣  Mike Chen - 94 pts (38 tickets, 4.8h avg)
  3️⃣  Emma Wilson - 89 pts (35 tickets, 5.1h avg)

⚠️  Needs Support:
  🔴 Tom Wilson - 68 pts (24 tickets, 8.2h avg - 45% slower)

DASHBOARD_DATA:
{
  "type": "agent-performance",
  "metrics": [
    {"label": "Sarah Martinez", "value": "⭐ 1st", "status": "success", "icon": "Crown", "change": "98 pts", "trend": "up", "uptime": "42 tickets", "lastSync": "4.2h avg"},
    {"label": "Mike Chen", "value": "2nd", "status": "success", "icon": "Award", "change": "94 pts", "trend": "up", "uptime": "38 tickets", "lastSync": "4.8h avg"},
    {"label": "Emma Wilson", "value": "3rd", "status": "info", "icon": "Target", "change": "89 pts", "trend": "stable", "uptime": "35 tickets", "lastSync": "5.1h avg"},
    {"label": "Christopher Hayes", "value": "4th", "status": "info", "icon": "Users", "change": "85 pts", "trend": "up", "uptime": "33 tickets", "lastSync": "5.4h avg"},
    {"label": "Lisa Park", "value": "5th", "status": "info", "icon": "Activity", "change": "82 pts", "trend": "down", "uptime": "31 tickets", "lastSync": "5.9h avg"},
    {"label": "Tom Wilson", "value": "⚠️ 6th", "status": "warning", "icon": "TrendingDown", "change": "68 pts", "trend": "down", "uptime": "24 tickets", "lastSync": "8.2h avg"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 Recommended Actions:
  ⭐ Celebrate: Sarah achieved perfect 100% CSAT this week!
  🔧 1-on-1 Coaching: Schedule with Tom Wilson (response time concern)
  📊 Team Average: 5.3h resolution time (within target)`;
  }

  // Most Slacking Agent (CS Manager Query)
  if ((messageLower.includes('slacking') || messageLower.includes('worst') || messageLower.includes('underperforming')) && (messageLower.includes('agent') || messageLower.includes('who'))) {
    const alerts = [
      {"level": "critical", "message": "Tom Wilson's performance declined 45% in last 2 weeks - immediate intervention needed", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "critical", "message": "Tom's SLA breaches account for 58% of team total this week", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "warning", "message": "Tom's CSAT score dropped from 4.1 to 3.2 in 3 weeks - customer satisfaction concern", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "Tom has 24 active tickets (160% capacity) - recommend reassigning 9 tickets immediately", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "30-day performance improvement plan recommended with Sarah Martinez as mentor", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `🔴 **UNDERPERFORMING AGENT IDENTIFIED:** Tom Wilson - Ranking #6 of 6 (Bottom Performer)

**Quick Verdict:** Immediate coaching intervention required. Performance declined 45% in 2 weeks. Reassign 9 tickets today and implement 30-day improvement plan.

DASHBOARD_DATA:
{
  "type": "agent-coaching-needed",
  "metrics": [
    {"label": "🔴 Tom Wilson", "value": "68/100", "status": "error", "icon": "UserX", "change": "Performance Score", "trend": "down", "uptime": "Rank: #6 of 6", "lastSync": "Critical Status"},

    {"label": "Resolution Time (Tom)", "value": "8.2h", "status": "error", "icon": "Clock", "change": "58% slower", "trend": "up", "uptime": "vs 5.2h team", "lastSync": "Worst on team"},
    {"label": "Resolution Time (Team)", "value": "5.2h", "status": "info", "icon": "Users", "change": "Team average", "trend": "stable", "uptime": "Baseline", "lastSync": "Normal"},
    {"label": "Resolution Time (Sarah)", "value": "4.2h", "status": "success", "icon": "Award", "change": "19% faster", "trend": "down", "uptime": "Top performer", "lastSync": "Best on team"},

    {"label": "CSAT Score (Tom)", "value": "3.2★", "status": "error", "icon": "TrendingDown", "change": "-27% below", "trend": "down", "uptime": "vs 4.4 team", "lastSync": "Critical low"},
    {"label": "CSAT Score (Team)", "value": "4.4★", "status": "info", "icon": "Target", "change": "Team average", "trend": "stable", "uptime": "Baseline", "lastSync": "Normal"},
    {"label": "CSAT Score (Sarah)", "value": "4.9★", "status": "success", "icon": "ThumbsUp", "change": "+11% above", "trend": "up", "uptime": "vs team avg", "lastSync": "Excellent"},

    {"label": "Tickets/Week (Tom)", "value": "24", "status": "warning", "icon": "FileText", "change": "-31% below", "trend": "down", "uptime": "vs 35 team", "lastSync": "Low volume"},
    {"label": "Tickets/Week (Team)", "value": "35", "status": "info", "icon": "BarChart3", "change": "Team average", "trend": "stable", "uptime": "Baseline", "lastSync": "Normal"},
    {"label": "Tickets/Week (Sarah)", "value": "42", "status": "success", "icon": "TrendingUp", "change": "+20% above", "trend": "up", "uptime": "High performer", "lastSync": "Top volume"},

    {"label": "Week 1 (3 weeks ago)", "value": "6.5h", "status": "info", "icon": "Calendar", "change": "Resolution", "trend": "stable", "uptime": "CSAT: 4.1★", "lastSync": "Acceptable"},
    {"label": "Week 2 (2 weeks ago)", "value": "7.2h", "status": "warning", "icon": "Calendar", "change": "Resolution", "trend": "up", "uptime": "CSAT: 3.8★", "lastSync": "Declining"},
    {"label": "Week 3 (Last week)", "value": "7.8h", "status": "warning", "icon": "Calendar", "change": "Resolution", "trend": "up", "uptime": "CSAT: 3.5★", "lastSync": "Worsening"},
    {"label": "Week 4 (This week)", "value": "8.2h", "status": "error", "icon": "Calendar", "change": "Resolution", "trend": "up", "uptime": "CSAT: 3.2★", "lastSync": "Critical"},

    {"label": "SLA Breaches", "value": "7", "status": "error", "icon": "XCircle", "change": "58% of team", "trend": "up", "uptime": "vs 2/agent avg", "lastSync": "Critical issue"},
    {"label": "Reopened Tickets", "value": "12%", "status": "error", "icon": "RotateCw", "change": "+150% higher", "trend": "up", "uptime": "vs 4.8% team", "lastSync": "Quality issue"},
    {"label": "Response Delay", "value": "+1.4h", "status": "warning", "icon": "Clock", "change": "Slower avg", "trend": "up", "uptime": "First touch", "lastSync": "Below SLA"},
    {"label": "Overdue Tickets", "value": "9", "status": "error", "icon": "AlertOctagon", "change": "Past SLA", "trend": "up", "uptime": "Immediate risk", "lastSync": "Action needed"},
    {"label": "Customer Escalations", "value": "3", "status": "warning", "icon": "AlertTriangle", "change": "This week", "trend": "up", "uptime": "Unhappy clients", "lastSync": "Reputation risk"},
    {"label": "Quality Score", "value": "67/100", "status": "warning", "icon": "Award", "change": "Below 70", "trend": "down", "uptime": "Threshold", "lastSync": "Needs improvement"},

    {"label": "Team CSAT Impact", "value": "-0.3", "status": "warning", "icon": "TrendingDown", "change": "Points lower", "trend": "down", "uptime": "Tom's drag", "lastSync": "Team affected"},
    {"label": "Tickets to Reassign", "value": "9", "status": "error", "icon": "ArrowRight", "change": "Immediate", "trend": "stable", "uptime": "Workload fix", "lastSync": "Action today"},
    {"label": "Manager Coaching Time", "value": "4.5h/wk", "status": "warning", "icon": "Users", "change": "High burden", "trend": "up", "uptime": "Your time", "lastSync": "Resource cost"},
    {"label": "Revenue at Risk", "value": "$12K", "status": "warning", "icon": "DollarSign", "change": "ARR affected", "trend": "stable", "uptime": "3 accounts", "lastSync": "Business impact"},

    {"label": "📅 Week 1-2 Action", "value": "Mentoring", "status": "info", "icon": "UserPlus", "change": "With Sarah", "trend": "stable", "uptime": "8h commitment", "lastSync": "Pairing time"},
    {"label": "📅 Week 2 Action", "value": "15 Tickets", "status": "info", "icon": "Target", "change": "Reduced load", "trend": "down", "uptime": "From 24", "lastSync": "Capacity fix"},
    {"label": "📅 Week 3 Action", "value": "Daily Checkins", "status": "info", "icon": "CheckCircle2", "change": "Manager 1:1", "trend": "stable", "uptime": "15min/day", "lastSync": "Close monitor"},
    {"label": "📅 Week 4 Action", "value": "Review", "status": "info", "icon": "FileCheck", "change": "Decision point", "trend": "stable", "uptime": "Assessment", "lastSync": "Go/No-go"},

    {"label": "🎯 Resolution Target", "value": "6.5h", "status": "warning", "icon": "Target", "change": "Current: 8.2h", "trend": "down", "uptime": "Need -21%", "lastSync": "2-week goal"},
    {"label": "🎯 CSAT Target", "value": "4.0★", "status": "warning", "icon": "ThumbsUp", "change": "Current: 3.2★", "trend": "up", "uptime": "Need +0.8", "lastSync": "2-week goal"},
    {"label": "🎯 SLA Target", "value": "90%", "status": "warning", "icon": "CheckCircle", "change": "Current: 71%", "trend": "up", "uptime": "Need +19%", "lastSync": "Critical metric"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Immediate Actions Required:** Reassign 9 tickets today, schedule 1:1 coaching session this week, implement 30-day performance improvement plan with Sarah Martinez as mentor.`;
  }

  // Top Performing Agent (CS Manager Query)
  if ((messageLower.includes('top') || messageLower.includes('best')) && messageLower.includes('agent') && (messageLower.includes('performing') || messageLower.includes('who'))) {
    const alerts = [
      {"level": "info", "message": "Sarah Martinez achieved 100% CSAT this week - perfect score!", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "info", "message": "Sarah leads team in resolution speed (4.2h) and customer satisfaction (4.9)", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Consider Sarah as mentor for underperforming team members", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⭐ TOP PERFORMING AGENT ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 TEAM MVP: **Sarah Martinez**

📈 Outstanding Performance Metrics (This Week):
  🥇 Ranking: #1 of 6 agents (98 performance points)
  ⚡ Avg Resolution Time: 4.2 hours (19% faster than team avg)
  ⭐ CSAT Score: 4.9/5.0 (100% perfect scores this week!)
  📋 Ticket Volume: 42 tickets/week (20% above team avg)
  ✅ First Response SLA: 98.5% (best on team)
  ✅ Resolution SLA: 96.2% (best on team)
  🔄 Reopened Tickets: 0.8% (lowest on team - 6x better than avg)

🌟 Key Success Factors:
  ✓ Fastest resolution time while maintaining highest quality
  ✓ Handles 20% more tickets than team average
  ✓ Proactive communication - customers love her responsiveness
  ✓ Exceptional technical knowledge across all product areas
  ✓ Mentors junior agents during downtime

DASHBOARD_DATA:
{
  "type": "agent-excellence",
  "metrics": [
    {"label": "Sarah Martinez", "value": "⭐ #1 MVP", "status": "success", "icon": "Crown", "change": "98 pts", "trend": "up", "uptime": "Top 1%", "lastSync": "4.2h avg"},
    {"label": "Resolution Speed", "value": "4.2h", "status": "success", "icon": "Zap", "change": "vs 5.2h avg", "trend": "down", "uptime": "19% faster", "lastSync": "Best on team"},
    {"label": "CSAT Excellence", "value": "4.9/5.0", "status": "success", "icon": "Award", "change": "vs 4.4 avg", "trend": "up", "uptime": "100% this week", "lastSync": "Perfect scores"},
    {"label": "High Productivity", "value": "42 tickets", "status": "success", "icon": "TrendingUp", "change": "vs 35 avg", "trend": "up", "uptime": "+20% more", "lastSync": "Top volume"},
    {"label": "SLA Compliance", "value": "97.8%", "status": "success", "icon": "Target", "change": "vs 91.6% avg", "trend": "up", "uptime": "+6.2% better", "lastSync": "Exceptional"},
    {"label": "Quality Score", "value": "0.8%", "status": "success", "icon": "CheckCircle2", "change": "reopened rate", "trend": "down", "uptime": "vs 4.8% avg", "lastSync": "6x better"},
    {"label": "Consistency", "value": "12 weeks", "status": "success", "icon": "Activity", "change": "#1 streak", "trend": "stable", "uptime": "Top performer", "lastSync": "Sustained"},
    {"label": "Improvement", "value": "+8.2%", "status": "success", "icon": "ArrowUpCircle", "change": "vs last month", "trend": "up", "uptime": "Still improving", "lastSync": "Amazing growth"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RECOMMENDED ACTIONS TO LEVERAGE SARAH'S SUCCESS:

1️⃣  **Recognition & Rewards**
   🏆 Nominate for Employee of the Quarter award
   🎁 Consider spot bonus for exceptional Q4 performance
   📣 Highlight achievements in team meeting this Friday
   ✉️  Send congratulatory email from department leadership

2️⃣  **Knowledge Transfer**
   👥 Assign Sarah as mentor to Tom Wilson (underperforming)
   📚 Have Sarah document best practices for ticket resolution
   🎤 Schedule "Lunch & Learn" session for Sarah to share tactics
   📹 Record Sarah's workflow for training library

3️⃣  **Career Development**
   📈 Discuss promotion to Senior Support Engineer (if not already)
   🎯 Identify stretch projects to keep Sarah challenged
   💼 Consider Sarah for Team Lead when position opens
   📊 Include Sarah in strategic planning discussions

4️⃣  **Capacity Optimization**
   ➕ Sarah can handle +7 more tickets (currently at 53% capacity)
   🎯 Route complex escalations to Sarah when possible
   🔄 Reassign tickets from Tom Wilson to Sarah (5 tickets)

💡 **What Makes Sarah Exceptional:**
   • Technical expertise across all product areas
   • Proactive communication keeps customers happy
   • Efficient time management and prioritization
   • Natural mentor who elevates team performance
   • Consistent excellence over 12+ weeks

🌟 **Team Impact:** If all agents matched Sarah's performance, team would achieve 97% SLA, 4.9 CSAT, and handle 25% more volume.`;
  }

  // Customer Churn Risk Dashboard
  if (messageLower.includes('churn') || (messageLower.includes('customer') && messageLower.includes('risk'))) {
    const alerts = [
      {"level": "critical", "message": "TechCorp Solutions ($45K ARR) - No response to 3 support tickets in 2 weeks", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "critical", "message": "CloudNine Tech ($32K ARR) - CSAT dropped from 4.8 to 2.1 stars", "timestamp": generateRelativeTimestamp(3, 'hours')},
      {"level": "warning", "message": "InnovateStart ($28K ARR) - 5 escalations in last month", "timestamp": generateRelativeTimestamp(6, 'hours')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  CUSTOMER CHURN RISK DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 REVENUE AT RISK: $125,000 ARR (5 accounts)

🚨 Critical Priority (Immediate Action):
  🔴 TechCorp Solutions - $45K ARR (32% health, 14 days silent)
  🔴 CloudNine Tech - $32K ARR (28% health, 9 days silent)
     → No response to 3 support tickets + CSAT dropped to 2.1★

⚠️  High Risk Accounts:
  🟠 InnovateStart - $28K ARR (54% health, 5 escalations)
  🟠 BizGrowth Inc - $22K ARR (68% health, declining engagement)

DASHBOARD_DATA:
{
  "type": "churn-risk",
  "metrics": [
    {"label": "TechCorp Solutions", "value": "Critical", "status": "error", "icon": "AlertOctagon", "change": "32% health", "trend": "down", "uptime": "$45K ARR", "lastSync": "14 days ago"},
    {"label": "CloudNine Tech", "value": "Critical", "status": "error", "icon": "TrendingDown", "change": "28% health", "trend": "down", "uptime": "$32K ARR", "lastSync": "9 days ago"},
    {"label": "InnovateStart", "value": "High Risk", "status": "warning", "icon": "AlertTriangle", "change": "54% health", "trend": "down", "uptime": "$28K ARR", "lastSync": "3 days ago"},
    {"label": "BizGrowth Inc", "value": "Medium Risk", "status": "warning", "icon": "AlertCircle", "change": "68% health", "trend": "stable", "uptime": "$22K ARR", "lastSync": "2 days ago"},
    {"label": "DataFlow Systems", "value": "Watch List", "status": "info", "icon": "Eye", "change": "74% health", "trend": "down", "uptime": "$18K ARR", "lastSync": "1 day ago"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 URGENT ACTIONS (Next 24 Hours):
  📞 Schedule executive calls with TechCorp & CloudNine
  📧 Send personalized recovery emails to both accounts
  🎁 Prepare retention offers (discount/upgrade incentives)
  👥 Assign dedicated success manager to each account

💡 Recovery Strategy: Personal outreach + resolve outstanding tickets + offer 20% discount for renewal`;
  }

  // SLA Performance Dashboard
  if (messageLower.includes('sla') && (messageLower.includes('performance') || messageLower.includes('q4') || messageLower.includes('quarter'))) {
    const alerts = [
      {"level": "warning", "message": "December SLA dropped to 89.2% - below 90% target for first time this year", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "Average response time increased from 2.1h to 3.4h in Q4", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "First response SLA maintained at 95.8% across all months", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SLA PERFORMANCE REPORT (Q4 2025)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  TREND ALERT: Declining performance through Q4

📉 Quarter Summary:
  Q4 Average: 91.6% (Target: 92% - missed by 0.4%)
  📅 October: 94.1% ✅ (above target)
  📅 November: 91.5% ⚠️  (trending down)
  📅 December: 89.2% 🔴 (below 90% threshold - FIRST TIME this year)

⏱️  Response Time Analysis:
  Average: 3.4h (+1.3h slower than Q3)
  First Response SLA: 95.8% ✅ (maintaining excellence)
  Resolution Time: 18.2h (+2.1h increase)

DASHBOARD_DATA:
{
  "type": "sla-performance",
  "metrics": [
    {"label": "October", "value": "94.1%", "status": "success", "icon": "CheckCircle", "change": "+1.2%", "trend": "up"},
    {"label": "November", "value": "91.5%", "status": "success", "icon": "CheckCircle2", "change": "-2.6%", "trend": "down"},
    {"label": "December", "value": "89.2%", "status": "warning", "icon": "AlertCircle", "change": "-2.3%", "trend": "down"},
    {"label": "Q4 Average", "value": "91.6%", "status": "success", "icon": "TrendingUp", "change": "Target: 92%", "trend": "stable"},
    {"label": "Response Time", "value": "3.4h", "status": "warning", "icon": "Clock", "change": "+1.3h", "trend": "up"},
    {"label": "Resolution Time", "value": "18.2h", "status": "info", "icon": "Zap", "change": "+2.1h", "trend": "up"},
    {"label": "Breach Count", "value": "127", "status": "warning", "icon": "XCircle", "change": "+34", "trend": "up"},
    {"label": "First Response", "value": "95.8%", "status": "success", "icon": "Target", "change": "+0.4%", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Root Cause Analysis:
  • Holiday staffing shortages in December
  • Increased ticket volume (+34 breaches)
  • Resource constraints during peak season

💡 Recommendations for Q1 2026:
  ✓ Add 2-3 temporary support staff
  ✓ Improve ticket routing/prioritization
  ✓ Review team workload distribution`;
  }

  // API Rate Limits Dashboard
  if (messageLower.includes('api') && (messageLower.includes('rate') || messageLower.includes('limit') || messageLower.includes('usage'))) {
    const alerts = [
      {"level": "critical", "message": "Zoho CRM API at 91% of rate limit - throttling may begin within 2 hours", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "warning", "message": "Jira API quota resets in 47 minutes - current usage at 85%", "timestamp": generateRelativeTimestamp(12, 'minutes')},
      {"level": "info", "message": "Slack API upgraded to Premium tier - new limit: 100K/hour", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ API RATE LIMITS & USAGE DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 CRITICAL: 2 services approaching rate limits (action required)
⏰ Next Reset: 47 minutes (hourly limits)

📊 Usage Status:
  🔴 CRITICAL (>90%):
     • Zoho CRM: 91% (9.1K/10K) - throttling imminent!

  ⚠️  WARNING (>80%):
     • Jira API: 85% (4.2K/5K) - resets in 47m

  ✅ HEALTHY (<70%):
     • Slack: 42% (42K/100K)
     • Zoho Desk: 68% (6.8K/10K)
     • Google Calendar: 28% (2.8K/10K daily)
     • Email SMTP: 15% (1.5K/10K daily)

DASHBOARD_DATA:
{
  "type": "api-limits",
  "metrics": [
    {"label": "Zoho CRM", "value": "91%", "status": "error", "icon": "Database", "change": "9.1K/10K", "trend": "up", "uptime": "Hourly limit", "lastSync": "Resets in 47m"},
    {"label": "Jira API", "value": "85%", "status": "warning", "icon": "GitBranch", "change": "4.2K/5K", "trend": "up", "uptime": "Hourly limit", "lastSync": "Resets in 47m"},
    {"label": "Slack API", "value": "42%", "status": "success", "icon": "MessageSquare", "change": "42K/100K", "trend": "stable", "uptime": "Hourly limit", "lastSync": "Resets in 47m"},
    {"label": "Google Calendar", "value": "28%", "status": "success", "icon": "Calendar", "change": "2.8K/10K", "trend": "stable", "uptime": "Daily limit", "lastSync": "Resets in 16h"},
    {"label": "Email SMTP", "value": "15%", "status": "success", "icon": "Mail", "change": "1.5K/10K", "trend": "stable", "uptime": "Daily limit", "lastSync": "Resets in 16h"},
    {"label": "Zoho Desk", "value": "68%", "status": "info", "icon": "Headphones", "change": "6.8K/10K", "trend": "up", "uptime": "Hourly limit", "lastSync": "Resets in 47m"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 IMMEDIATE ACTIONS (Next 30 minutes):
  🔴 Zoho CRM: Reduce sync frequency from 5min → 15min
  ⚠️  Jira: Pause non-critical sync operations until reset
  💰 Consider: Upgrade Zoho CRM to premium tier (+$45/month)

💡 Impact Prevention: Current rate will cause 2h service disruption if limit hit`;
  }

  // ========================================
  // BATCH 1: PERSONAL WORKLOAD DASHBOARDS
  // ========================================

  // My Tickets Received in Last 24 Hours
  if (messageLower.includes('my tickets') && (messageLower.includes('24') || messageLower.includes('last') || messageLower.includes('received'))) {
    const alerts = [
      {"level": "critical", "message": "DESK-1847 (TechCorp) - SLA breach in 45 minutes - START IMMEDIATELY", "timestamp": generateRelativeTimestamp(2, 'minutes')},
      {"level": "critical", "message": "TechCorp is high-value customer ($45K ARR) with 3 open tickets - escalation risk", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "warning", "message": "DESK-1843 (CloudNine) at churn risk - customer CSAT dropped to 2.1★", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "info", "message": "You resolved 8 tickets yesterday - 35% faster response time than team average!", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "AI auto-resolved 23 tickets today, saving you 9.2 hours", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `📥 **MY TICKET QUEUE (Last 24 Hours):** 18 tickets received (+6 from yesterday)

**Quick Overview:** You're crushing it today! 94% SLA compliance, 2.3h avg response (35% faster). One critical ticket needs immediate attention (45m window).

DASHBOARD_DATA:
{
  "type": "my-ticket-queue",
  "metrics": [
    {"label": "🎯 Your Performance", "value": "8.5/10", "status": "success", "icon": "Award", "change": "Top 25%", "trend": "up", "uptime": "Score today", "lastSync": "Excellent work"},
    {"label": "Tickets Received", "value": "18", "status": "info", "icon": "Inbox", "change": "+6 today", "trend": "up", "uptime": "+33% increase", "lastSync": "vs yesterday"},
    {"label": "Avg Response Time", "value": "2.3h", "status": "success", "icon": "Clock", "change": "-0.8h", "trend": "down", "uptime": "35% faster", "lastSync": "Great job!"},
    {"label": "Estimated Workload", "value": "6.5h", "status": "info", "icon": "Timer", "change": "Remaining", "trend": "stable", "uptime": "Today's work", "lastSync": "Manageable"},
    {"label": "SLA Compliance", "value": "94%", "status": "success", "icon": "CheckCircle", "change": "On track", "trend": "up", "uptime": "Target: 90%", "lastSync": "Exceeding goal"},

    {"label": "🔴 DESK-1847", "value": "CRITICAL", "status": "error", "icon": "AlertOctagon", "change": "45m to breach", "trend": "down", "uptime": "TechCorp", "lastSync": "START NOW"},
    {"label": "Issue Type", "value": "API Failure", "status": "error", "icon": "Zap", "change": "Technical", "trend": "stable", "uptime": "Integration", "lastSync": "High complexity"},
    {"label": "Customer Value", "value": "$45K ARR", "status": "error", "icon": "DollarSign", "change": "High-value", "trend": "stable", "uptime": "3 open tickets", "lastSync": "VIP account"},
    {"label": "Last Contact", "value": "2h 15m", "status": "warning", "icon": "Clock", "change": "Ago", "trend": "up", "uptime": "Escalation risk", "lastSync": "Follow up now"},
    {"label": "Suggested Action", "value": "Debug logs", "status": "info", "icon": "FileCheck", "change": "Tech required", "trend": "stable", "uptime": "Notify eng", "lastSync": "Next step"},

    {"label": "🟠 DESK-1843", "value": "HIGH", "status": "warning", "icon": "AlertTriangle", "change": "3h 20m left", "trend": "stable", "uptime": "CloudNine", "lastSync": "High priority"},
    {"label": "Issue Type", "value": "Performance", "status": "warning", "icon": "Activity", "change": "Infrastructure", "trend": "down", "uptime": "Degradation", "lastSync": "Slowness"},
    {"label": "Customer Risk", "value": "Churn risk", "status": "error", "icon": "TrendingDown", "change": "CSAT: 2.1★", "trend": "down", "uptime": "$32K ARR", "lastSync": "Unhappy"},
    {"label": "Last Contact", "value": "4h 30m", "status": "warning", "icon": "Phone", "change": "Ago", "trend": "up", "uptime": "Needs update", "lastSync": "Call due"},
    {"label": "Suggested Action", "value": "Schedule call", "status": "info", "icon": "Calendar", "change": "Today 10 AM", "trend": "stable", "uptime": "Share data", "lastSync": "Monitoring"},

    {"label": "🔴 Critical Queue", "value": "1", "status": "error", "icon": "XCircle", "change": "45m window", "trend": "stable", "uptime": "Immediate", "lastSync": "Act now"},
    {"label": "🟠 High Priority", "value": "1", "status": "warning", "icon": "AlertCircle", "change": "3h 20m", "trend": "stable", "uptime": "Urgent", "lastSync": "This morning"},
    {"label": "🟡 Medium Priority", "value": "1", "status": "info", "icon": "FileText", "change": "6h 15m", "trend": "stable", "uptime": "Normal", "lastSync": "After lunch"},
    {"label": "🟢 Low Priority", "value": "1", "status": "success", "icon": "CheckCircle2", "change": "12h 40m", "trend": "stable", "uptime": "Routine", "lastSync": "End of day"},
    {"label": "⚪ Routine Items", "value": "14", "status": "info", "icon": "Inbox", "change": "Normal SLA", "trend": "stable", "uptime": "Standard", "lastSync": "No rush"},
    {"label": "Queue Health", "value": "94%", "status": "success", "icon": "Target", "change": "On track", "trend": "up", "uptime": "SLA safe", "lastSync": "Excellent"},

    {"label": "Critical Work", "value": "1.5h", "status": "error", "icon": "Clock", "change": "DESK-1847", "trend": "stable", "uptime": "Estimated", "lastSync": "High effort"},
    {"label": "High Priority", "value": "2.0h", "status": "warning", "icon": "Timer", "change": "DESK-1843", "trend": "stable", "uptime": "Estimated", "lastSync": "Medium effort"},
    {"label": "Medium Priority", "value": "1.5h", "status": "info", "icon": "Activity", "change": "DESK-1841", "trend": "stable", "uptime": "Estimated", "lastSync": "Normal effort"},
    {"label": "Low Priority", "value": "1.0h", "status": "success", "icon": "CheckCircle", "change": "DESK-1838", "trend": "stable", "uptime": "Estimated", "lastSync": "Quick fix"},
    {"label": "Routine Work", "value": "0.5h", "status": "info", "icon": "Zap", "change": "14 tickets", "trend": "stable", "uptime": "Estimated", "lastSync": "Fast batch"},

    {"label": "High-Value Customers", "value": "3", "status": "warning", "icon": "DollarSign", "change": "$97K ARR", "trend": "stable", "uptime": "VIP accounts", "lastSync": "Priority focus"},
    {"label": "At-Risk Customers", "value": "2", "status": "error", "icon": "AlertTriangle", "change": "Churn risk", "trend": "down", "uptime": "Retention", "lastSync": "Critical care"},
    {"label": "New Customers", "value": "1", "status": "info", "icon": "UserPlus", "change": "Onboarding", "trend": "up", "uptime": "First 30 days", "lastSync": "Make happy"},
    {"label": "Recurring Issues", "value": "2", "status": "warning", "icon": "RotateCw", "change": "Known bugs", "trend": "stable", "uptime": "Workarounds", "lastSync": "Temp fixes"},

    {"label": "Today vs Yesterday", "value": "+6", "status": "info", "icon": "TrendingUp", "change": "More tickets", "trend": "up", "uptime": "-0.8h faster", "lastSync": "Better pace"},
    {"label": "This Week Avg", "value": "35/day", "status": "info", "icon": "BarChart3", "change": "Ticket volume", "trend": "stable", "uptime": "3.1h response", "lastSync": "Normal load"},
    {"label": "Your Ranking", "value": "#4 of 18", "status": "success", "icon": "Award", "change": "Top 25%", "trend": "up", "uptime": "Agents", "lastSync": "Excellent"},
    {"label": "CSAT This Week", "value": "4.7/5.0", "status": "success", "icon": "ThumbsUp", "change": "+0.3 vs team", "trend": "up", "uptime": "Above avg", "lastSync": "Happy customers"},
    {"label": "Your Streak", "value": "5 days", "status": "success", "icon": "Zap", "change": "Zero breaches", "trend": "up", "uptime": "Perfect SLA", "lastSync": "Keep it up!"},

    {"label": "AI Auto-Resolved", "value": "23", "status": "success", "icon": "Zap", "change": "56% volume", "trend": "up", "uptime": "Today", "lastSync": "Automation win"},
    {"label": "AI Suggestions", "value": "8", "status": "info", "icon": "MessageCircle", "change": "Draft replies", "trend": "stable", "uptime": "Ready to use", "lastSync": "Time saver"},
    {"label": "Time Saved by AI", "value": "9.2h", "status": "success", "icon": "Clock", "change": "Automated", "trend": "up", "uptime": "Today", "lastSync": "Huge impact"},

    {"label": "⏰ Now (Immediate)", "value": "DESK-1847", "status": "error", "icon": "AlertOctagon", "change": "45m window", "trend": "down", "uptime": "TechCorp", "lastSync": "Critical"},
    {"label": "⏰ 10 AM", "value": "DESK-1843", "status": "warning", "icon": "Phone", "change": "Schedule call", "trend": "stable", "uptime": "CloudNine", "lastSync": "High priority"},
    {"label": "⏰ 2 PM", "value": "DESK-1841", "status": "info", "icon": "FileText", "change": "+ DESK-1838", "trend": "stable", "uptime": "After lunch", "lastSync": "Medium/Low"},
    {"label": "⏰ 4 PM", "value": "14 tickets", "status": "info", "icon": "Inbox", "change": "Review batch", "trend": "stable", "uptime": "Routine", "lastSync": "End of day"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**🚨 Immediate Action:** Drop everything and work on DESK-1847 (TechCorp API failure) - only 45 minutes until SLA breach. This is a $45K ARR account with escalation risk.`;
  }

  // What Are My Urgent Tickets Right Now?
  if ((messageLower.includes('urgent') || messageLower.includes('critical')) && messageLower.includes('ticket') && (messageLower.includes('my') || messageLower.includes('right now'))) {
    const alerts = [
      {"level": "critical", "message": "2 critical tickets with SLA breach risk within 1 hour", "timestamp": generateRelativeTimestamp(1, 'minutes')},
      {"level": "warning", "message": "4 high-priority tickets need response within 4 hours", "timestamp": generateRelativeTimestamp(10, 'minutes')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 URGENT TICKETS - IMMEDIATE ACTION REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  ALERT: 6 urgent tickets need your attention RIGHT NOW

🔴 CRITICAL (SLA Breach Imminent - <1 hour):
  ⏰ DESK-1847 (TechCorp) - 45 minutes remaining
  ⏰ DESK-1845 (Enterprise Corp) - 58 minutes remaining

⚠️  HIGH PRIORITY (SLA Breach Risk - <5 hours):
  🟠 DESK-1843 (CloudNine) - 3h 20m remaining
  🟠 DESK-1842 (BizGrowth) - 3h 45m remaining
  🟠 DESK-1840 (StartupHub) - 4h 10m remaining
  🟠 DESK-1839 (TechScale) - 4h 30m remaining

DASHBOARD_DATA:
{
  "type": "my-ticket-queue",
  "metrics": [
    {"label": "DESK-1847", "value": "CRITICAL", "status": "error", "icon": "AlertOctagon", "change": "SLA: 45m", "trend": "down", "timer": "45m to breach", "severity": "critical", "customerName": "TechCorp Solutions", "ticketId": "DESK-1847"},
    {"label": "DESK-1845", "value": "CRITICAL", "status": "error", "icon": "XCircle", "change": "SLA: 58m", "trend": "down", "timer": "58m to breach", "severity": "critical", "customerName": "Enterprise Corp", "ticketId": "DESK-1845"},
    {"label": "DESK-1843", "value": "HIGH", "status": "warning", "icon": "AlertTriangle", "change": "SLA: 3h 20m", "trend": "stable", "timer": "3h 20m to breach", "severity": "high", "customerName": "CloudNine Tech", "ticketId": "DESK-1843"},
    {"label": "DESK-1842", "value": "HIGH", "status": "warning", "icon": "AlertCircle", "change": "SLA: 3h 45m", "trend": "stable", "timer": "3h 45m to breach", "severity": "high", "customerName": "BizGrowth Inc", "ticketId": "DESK-1842"},
    {"label": "DESK-1840", "value": "HIGH", "status": "warning", "icon": "AlertTriangle", "change": "SLA: 4h 10m", "trend": "stable", "timer": "4h 10m to breach", "severity": "high", "customerName": "StartupHub", "ticketId": "DESK-1840"},
    {"label": "DESK-1839", "value": "HIGH", "status": "warning", "icon": "AlertCircle", "change": "SLA: 4h 30m", "trend": "stable", "timer": "4h 30m to breach", "severity": "high", "customerName": "TechScale Ltd", "ticketId": "DESK-1839"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 RECOMMENDED TRIAGE ORDER:
  1️⃣  DESK-1847 (TechCorp) - START IMMEDIATELY
  2️⃣  DESK-1845 (Enterprise) - Next priority
  3️⃣  DESK-1843, 1842, 1840, 1839 - Handle after critical

⏱️  Time Budget: ~2.5 hours needed to clear critical queue`;
  }

  // Show Me Tickets I Can Close Today
  if (messageLower.includes('close') && messageLower.includes('ticket') && (messageLower.includes('today') || messageLower.includes('can'))) {
    const alerts = [
      {"level": "info", "message": "8 tickets resolved and awaiting customer confirmation", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "info", "message": "All resolved tickets have CSAT scores above 4.0", "timestamp": generateRelativeTimestamp(1, 'hours')}
    ];

    return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ TICKETS READY TO CLOSE TODAY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎉 Great news! 8 tickets are ready for closure

📊 Closure Summary:
  ✅ Total Ready: 8 tickets (+2 from yesterday)
  ⭐ Avg CSAT: 4.8/5.0 (excellent performance!)
  🏆 Perfect Scores: 2 tickets (5.0 stars)
  👍 All customers confirmed resolution

🌟 Top Rated Resolutions:
  ⭐⭐⭐⭐⭐ DESK-1835 (DataFlow) - 5.0 CSAT
  ⭐⭐⭐⭐⭐ DESK-1823 (CloudNine) - 5.0 CSAT
  ⭐⭐⭐⭐ DESK-1828 (BizGrowth) - 4.9 CSAT
  ⭐⭐⭐⭐ DESK-1832 (InnovateStart) - 4.8 CSAT

DASHBOARD_DATA:
{
  "type": "my-ticket-queue",
  "metrics": [
    {"label": "DESK-1835", "value": "✓ Resolved", "status": "success", "icon": "CheckCircle2", "change": "CSAT: 5.0", "trend": "up", "customerName": "DataFlow Systems", "ticketId": "DESK-1835"},
    {"label": "DESK-1832", "value": "✓ Resolved", "status": "success", "icon": "CheckCircle", "change": "CSAT: 4.8", "trend": "up", "customerName": "InnovateStart", "ticketId": "DESK-1832"},
    {"label": "DESK-1828", "value": "✓ Resolved", "status": "success", "icon": "ThumbsUp", "change": "CSAT: 4.9", "trend": "up", "customerName": "BizGrowth Inc", "ticketId": "DESK-1828"},
    {"label": "DESK-1825", "value": "✓ Resolved", "status": "success", "icon": "CheckCircle2", "change": "CSAT: 4.7", "trend": "up", "customerName": "TechScale Ltd", "ticketId": "DESK-1825"},
    {"label": "DESK-1823", "value": "✓ Resolved", "status": "success", "icon": "CheckCircle", "change": "CSAT: 5.0", "trend": "up", "customerName": "CloudNine Tech", "ticketId": "DESK-1823"},
    {"label": "DESK-1820", "value": "✓ Resolved", "status": "success", "icon": "ThumbsUp", "change": "CSAT: 4.6", "trend": "up", "customerName": "StartupHub", "ticketId": "DESK-1820"},
    {"label": "Ready to Close", "value": "8", "status": "success", "icon": "Target", "change": "+2 today", "trend": "up"},
    {"label": "Avg CSAT", "value": "4.8/5.0", "status": "success", "icon": "Award", "change": "+0.3", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💪 Excellent Work! Your CSAT is up 0.3 points today
🎯 Quick Win: Close all 8 tickets in ~15 minutes`;
  }

  // How Many Tickets Did AI Resolve for Me?
  if ((messageLower.includes('ai') && messageLower.includes('resolve')) || (messageLower.includes('ai') && messageLower.includes('ticket'))) {
    const alerts = [
      {"level": "info", "message": "AI resolved 23 tickets today - saved you ~9.2 hours", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "info", "message": "AI accuracy rate: 94.2% - only 2 tickets escalated back", "timestamp": generateRelativeTimestamp(1, 'hours')}
    ];

    return `Here's your AI automation summary:

DASHBOARD_DATA:
{
  "type": "my-ticket-queue",
  "metrics": [
    {"label": "AI Resolved Today", "value": "23", "status": "success", "icon": "Zap", "change": "+8 vs yesterday", "trend": "up"},
    {"label": "Time Saved", "value": "9.2h", "status": "success", "icon": "Clock", "change": "+3.1h", "trend": "up"},
    {"label": "AI Success Rate", "value": "94.2%", "status": "success", "icon": "Target", "change": "+2.1%", "trend": "up"},
    {"label": "Auto-Categorized", "value": "31", "status": "info", "icon": "GitBranch", "change": "100% accurate", "trend": "stable"},
    {"label": "Password Resets", "value": "12", "status": "success", "icon": "Lock", "change": "Auto-resolved", "trend": "stable"},
    {"label": "Common FAQs", "value": "8", "status": "success", "icon": "MessageCircle", "change": "KB articles sent", "trend": "stable"},
    {"label": "Login Issues", "value": "3", "status": "success", "icon": "Shield", "change": "SSO fixes", "trend": "stable"},
    {"label": "Manual Tickets", "value": "18", "status": "info", "icon": "Users", "change": "Requires you", "trend": "stable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**AI Impact:** AI handled 56% of your ticket volume today (23 of 41 total). You're focusing on complex issues that truly need human expertise.`;
  }

  // ========================================
  // BATCH 2: PERFORMANCE & ANALYTICS
  // ========================================

  // My Ticket Resolution Rate This Week
  if (messageLower.includes('resolution') && messageLower.includes('rate') && (messageLower.includes('week') || messageLower.includes('my'))) {
    const alerts = [
      {"level": "info", "message": "Your resolution rate improved by 12% compared to last week", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Wednesday was your most productive day (9 tickets resolved)", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `Here's your ticket resolution performance this week:

DASHBOARD_DATA:
{
  "type": "agent-personal-performance",
  "metrics": [
    {"label": "Monday", "value": "7", "status": "success", "icon": "CheckCircle2", "change": "4.2h avg", "trend": "stable"},
    {"label": "Tuesday", "value": "6", "status": "success", "icon": "Target", "change": "4.8h avg", "trend": "up"},
    {"label": "Wednesday", "value": "9", "status": "success", "icon": "Award", "change": "3.9h avg", "trend": "down"},
    {"label": "Thursday", "value": "8", "status": "success", "icon": "CheckCircle", "change": "4.1h avg", "trend": "stable"},
    {"label": "Friday (so far)", "value": "5", "status": "info", "icon": "Clock", "change": "4.5h avg", "trend": "stable"},
    {"label": "Week Total", "value": "35", "status": "success", "icon": "TrendingUp", "change": "+4 vs last week", "trend": "up"},
    {"label": "Avg Resolution Time", "value": "4.3h", "status": "success", "icon": "Timer", "change": "-0.5h", "trend": "down"},
    {"label": "CSAT Score", "value": "4.7/5.0", "status": "success", "icon": "ThumbsUp", "change": "+0.2", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Weekly Performance:** You resolved 35 tickets this week with an average resolution time of 4.3 hours - 12% faster than last week. Keep it up!`;
  }

  // My Performance Metrics vs Team Average
  if (messageLower.includes('performance') && messageLower.includes('metrics') && (messageLower.includes('team') || messageLower.includes('average') || messageLower.includes('vs'))) {
    const alerts = [
      {"level": "info", "message": "You're in the top 25% of the team for response time", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "warning", "message": "Your ticket volume is 15% below team average - consider taking on more", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Your CSAT score is 0.3 points above team average - excellent!", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `Here's how you compare to the team average:

DASHBOARD_DATA:
{
  "type": "agent-personal-performance",
  "metrics": [
    {"label": "Response Time", "value": "2.3h", "status": "success", "icon": "Clock", "change": "Team: 3.1h", "trend": "down", "uptime": "You", "lastSync": "26% faster"},
    {"label": "Resolution Time", "value": "4.3h", "status": "success", "icon": "Timer", "change": "Team: 5.2h", "trend": "down", "uptime": "You", "lastSync": "17% faster"},
    {"label": "Tickets/Week", "value": "35", "status": "warning", "icon": "Target", "change": "Team: 41", "trend": "down", "uptime": "You", "lastSync": "15% below"},
    {"label": "CSAT Score", "value": "4.7", "status": "success", "icon": "ThumbsUp", "change": "Team: 4.4", "trend": "up", "uptime": "You", "lastSync": "+0.3 higher"},
    {"label": "First Response SLA", "value": "96.2%", "status": "success", "icon": "Zap", "change": "Team: 93.1%", "trend": "up", "uptime": "You", "lastSync": "+3.1%"},
    {"label": "Resolution SLA", "value": "91.8%", "status": "success", "icon": "CheckCircle2", "change": "Team: 89.5%", "trend": "up", "uptime": "You", "lastSync": "+2.3%"},
    {"label": "Reopened Tickets", "value": "2.1%", "status": "success", "icon": "RotateCw", "change": "Team: 4.8%", "trend": "down", "uptime": "You", "lastSync": "56% lower"},
    {"label": "Overall Ranking", "value": "#4 of 18", "status": "success", "icon": "Award", "change": "Top 22%", "trend": "up", "uptime": "You", "lastSync": "↑ from #6"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Performance Summary:** You rank #4 out of 18 agents. Your strengths: faster resolution times, higher CSAT, fewer reopens. Growth area: consider increasing ticket volume.`;
  }

  // ========================================
  // BATCH 3: CUSTOMER INTERACTION TOOLS
  // ========================================

  // Show Me Conversation History with TechCorp Solutions
  if (messageLower.includes('conversation') && messageLower.includes('history') && (messageLower.includes('techcorp') || messageLower.includes('customer'))) {
    const alerts = [
      {"level": "warning", "message": "TechCorp health score dropped from 85% to 68% in last 30 days", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Last positive interaction was 12 days ago - consider proactive check-in", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `Here's your interaction history with TechCorp Solutions:

DASHBOARD_DATA:
{
  "type": "customer-interaction",
  "metrics": [
    {"label": "Total Interactions", "value": "47", "status": "info", "icon": "MessageCircle", "change": "Last 90 days", "trend": "stable"},
    {"label": "Open Tickets", "value": "3", "status": "warning", "icon": "AlertTriangle", "change": "2 critical", "trend": "up"},
    {"label": "Avg Response Time", "value": "2.1h", "status": "success", "icon": "Clock", "change": "-0.4h", "trend": "down"},
    {"label": "Customer Health", "value": "68%", "status": "warning", "icon": "TrendingDown", "change": "-17% (30d)", "trend": "down"},
    {"label": "CSAT Score", "value": "3.8/5.0", "status": "warning", "icon": "ThumbsDown", "change": "-0.9", "trend": "down"},
    {"label": "Last Contact", "value": "2h ago", "status": "info", "icon": "Phone", "change": "DESK-1847", "trend": "stable"},
    {"label": "Resolved Tickets", "value": "44", "status": "success", "icon": "CheckCircle2", "change": "93.6% rate", "trend": "stable"},
    {"label": "ARR Value", "value": "$45K", "status": "warning", "icon": "Target", "change": "High-value", "trend": "stable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Customer Context:** TechCorp Solutions is a high-value account ($45K ARR) showing declining health. 3 open tickets (2 critical) need immediate attention.`;
  }

  // Prep Notes for My 2 PM Customer Call
  if ((messageLower.includes('prep') || messageLower.includes('notes') || messageLower.includes('meeting')) && (messageLower.includes('call') || messageLower.includes('2 pm') || messageLower.includes('customer'))) {
    const alerts = [
      {"level": "info", "message": "Meeting with David Chen (CTO) from CloudNine Tech at 2:00 PM", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "warning", "message": "CloudNine has 2 open P1 tickets - be prepared to discuss escalation", "timestamp": generateRelativeTimestamp(30, 'minutes')}
    ];

    return `Here's your meeting prep brief for the 2 PM call:

DASHBOARD_DATA:
{
  "type": "customer-interaction",
  "metrics": [
    {"label": "Customer", "value": "CloudNine Tech", "status": "info", "icon": "Users", "change": "$32K ARR", "trend": "stable"},
    {"label": "Attendee", "value": "David Chen", "status": "info", "icon": "User", "change": "CTO", "trend": "stable"},
    {"label": "Meeting Topic", "value": "Escalations", "status": "warning", "icon": "AlertTriangle", "change": "2 P1 tickets", "trend": "stable"},
    {"label": "Open Tickets", "value": "5", "status": "warning", "icon": "FileText", "change": "2 critical", "trend": "up"},
    {"label": "Last Meeting", "value": "18 days ago", "status": "warning", "icon": "Calendar", "change": "Too long", "trend": "stable"},
    {"label": "Recent CSAT", "value": "2.1/5.0", "status": "error", "icon": "TrendingDown", "change": "⚠️ Very low", "trend": "down"},
    {"label": "Account Health", "value": "28%", "status": "error", "icon": "AlertOctagon", "change": "Critical", "trend": "down"},
    {"label": "Churn Risk", "value": "High", "status": "error", "icon": "XCircle", "change": "Action needed", "trend": "stable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Call Agenda:**
1. Acknowledge recent service issues and apologize
2. Review DESK-1843 (API integration failure) and DESK-1845 (Data sync errors)
3. Present resolution timeline and assign senior engineer
4. Discuss SLA credits for recent downtime
5. Schedule weekly check-ins for next 4 weeks

**Talking Points:** CloudNine is at high churn risk. CSAT dropped from 4.8 to 2.1. Be empathetic, take ownership, and escalate to manager if needed.`;
  }

  // AI-Suggested Canned Responses for Common Issues
  if (messageLower.includes('canned') || (messageLower.includes('ai') && messageLower.includes('response'))) {
    const alerts = [
      {"level": "info", "message": "Top 5 response templates matched to your current ticket queue", "timestamp": generateRelativeTimestamp(1, 'minutes')},
      {"level": "info", "message": "These templates have 91.2% customer satisfaction rate", "timestamp": generateRelativeTimestamp(10, 'minutes')}
    ];

    return `Here are AI-suggested canned responses for your common ticket types:

DASHBOARD_DATA:
{
  "type": "customer-interaction",
  "metrics": [
    {"label": "Password Reset", "value": "Template #1", "status": "success", "icon": "Lock", "change": "Used 147x", "trend": "up", "uptime": "4.9/5.0 CSAT", "lastSync": "Match: 6 tickets"},
    {"label": "API Auth Error", "value": "Template #2", "status": "info", "icon": "Key", "change": "Used 89x", "trend": "stable", "uptime": "4.7/5.0 CSAT", "lastSync": "Match: 3 tickets"},
    {"label": "Login Issues", "value": "Template #3", "status": "success", "icon": "Shield", "change": "Used 124x", "trend": "up", "uptime": "4.8/5.0 CSAT", "lastSync": "Match: 4 tickets"},
    {"label": "Data Sync Delay", "value": "Template #4", "status": "warning", "icon": "GitBranch", "change": "Used 67x", "trend": "stable", "uptime": "4.2/5.0 CSAT", "lastSync": "Match: 2 tickets"},
    {"label": "Feature Request", "value": "Template #5", "status": "info", "icon": "Zap", "change": "Used 103x", "trend": "stable", "uptime": "4.6/5.0 CSAT", "lastSync": "Match: 2 tickets"},
    {"label": "Billing Question", "value": "Template #6", "status": "success", "icon": "Target", "change": "Used 92x", "trend": "up", "uptime": "4.9/5.0 CSAT", "lastSync": "Match: 1 ticket"},
    {"label": "Overall Accuracy", "value": "91.2%", "status": "success", "icon": "CheckCircle2", "change": "AI match rate", "trend": "up"},
    {"label": "Time Saved", "value": "~3.2h/day", "status": "success", "icon": "Clock", "change": "Using templates", "trend": "stable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Template Recommendation:** Use Template #1 (Password Reset) for DESK-1838, DESK-1836, DESK-1834. Customize with customer name for personal touch.`;
  }

  // ========================================
  // BATCH 4: WORKFLOW ACTIONS
  // ========================================

  // Draft Response for Ticket DESK-1002
  if (messageLower.includes('draft') && messageLower.includes('response') && (messageLower.includes('desk') || messageLower.includes('ticket'))) {
    const alerts = [
      {"level": "info", "message": "AI generated response based on ticket context and customer history", "timestamp": generateRelativeTimestamp(1, 'minutes')},
      {"level": "info", "message": "Response tone: Professional - adjust if needed", "timestamp": generateRelativeTimestamp(2, 'minutes')}
    ];

    return `Here's an AI-drafted response for ticket DESK-1002:

DASHBOARD_DATA:
{
  "type": "workflow-assistant",
  "metrics": [
    {"label": "Ticket", "value": "DESK-1002", "status": "info", "icon": "FileText", "change": "API Integration", "trend": "stable"},
    {"label": "Customer", "value": "DataFlow", "status": "info", "icon": "Users", "change": "$18K ARR", "trend": "stable"},
    {"label": "Priority", "value": "Medium", "status": "info", "icon": "Target", "change": "SLA: 4h 20m", "trend": "stable"},
    {"label": "Response Tone", "value": "Professional", "status": "success", "icon": "MessageCircle", "change": "Recommended", "trend": "stable"},
    {"label": "Word Count", "value": "127 words", "status": "success", "icon": "FileText", "change": "Optimal", "trend": "stable"},
    {"label": "Readability", "value": "Grade 8", "status": "success", "icon": "CheckCircle2", "change": "Clear", "trend": "stable"},
    {"label": "Similar Tickets", "value": "14", "status": "info", "icon": "GitBranch", "change": "Resolved", "trend": "stable"},
    {"label": "Avg CSAT", "value": "4.6/5.0", "status": "success", "icon": "Award", "change": "For this type", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**AI-Drafted Response:**

"Hi Sarah,

Thank you for reaching out about the API integration timeout errors you're experiencing with our webhook endpoints.

I've reviewed your logs and identified the root cause: your API requests are timing out after 5 seconds, but our webhook processing can take up to 8 seconds during peak hours due to data validation.

**Resolution Steps:**
1. Increase your timeout threshold to 15 seconds
2. Implement exponential backoff retry logic (2s, 4s, 8s intervals)
3. Subscribe to our webhook status endpoint for real-time processing updates

I've attached a code sample implementing these best practices. This should resolve 95% of your timeout errors.

Please let me know if you need help implementing these changes. I'm happy to schedule a 15-minute technical walkthrough.

Best regards,
Christopher Hayes"

**Suggested Edits:** Add customer's name in greeting, mention their specific use case, offer call-to-action.`;
  }

  // Link Ticket DESK-1002 to Jira Issue PROJ-302
  if (messageLower.includes('link') && messageLower.includes('jira') && (messageLower.includes('desk') || messageLower.includes('ticket'))) {
    const alerts = [
      {"level": "info", "message": "Successfully linked DESK-1002 to JIRA-PROJ-302", "timestamp": generateRelativeTimestamp(30, 'seconds')},
      {"level": "info", "message": "Bi-directional sync enabled - comments will sync in real-time", "timestamp": generateRelativeTimestamp(1, 'minutes')}
    ];

    return `Ticket successfully linked to Jira issue:

DASHBOARD_DATA:
{
  "type": "workflow-assistant",
  "metrics": [
    {"label": "Ticket ID", "value": "DESK-1002", "status": "success", "icon": "FileText", "change": "Zoho Desk", "trend": "stable"},
    {"label": "Jira Issue", "value": "PROJ-302", "status": "success", "icon": "GitBranch", "change": "Engineering", "trend": "stable"},
    {"label": "Link Status", "value": "✓ Active", "status": "success", "icon": "Link2", "change": "Bi-directional", "trend": "stable"},
    {"label": "Sync Frequency", "value": "Real-time", "status": "success", "icon": "Zap", "change": "Every 30s", "trend": "stable"},
    {"label": "Jira Status", "value": "In Progress", "status": "info", "icon": "Clock", "change": "Updated 5m ago", "trend": "stable"},
    {"label": "Assigned To", "value": "Mike Chen", "status": "info", "icon": "Users", "change": "Sr. Engineer", "trend": "stable"},
    {"label": "Est. Resolution", "value": "2-3 days", "status": "warning", "icon": "Timer", "change": "In sprint", "trend": "stable"},
    {"label": "Priority Match", "value": "✓ P2/Medium", "status": "success", "icon": "CheckCircle2", "change": "Aligned", "trend": "stable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Integration Details:**
- **Jira Issue:** PROJ-302 - "Fix API webhook timeout handling"
- **Assignee:** Mike Chen (Engineering)
- **Sprint:** Sprint 24 (Feb 3-16)
- **Status Updates:** Will sync automatically to DESK-1002 comments
- **Customer Visibility:** Jira technical details hidden from customer

**Next Steps:** Customer will receive automatic updates when Jira status changes (In Progress → Code Review → QA → Done).`;
  }

  // Schedule Follow-up Meeting with CloudNine Technologies
  if (messageLower.includes('schedule') && messageLower.includes('meeting') && (messageLower.includes('cloudnine') || messageLower.includes('follow') || messageLower.includes('customer'))) {
    const alerts = [
      {"level": "info", "message": "Meeting scheduled for tomorrow at 2:00 PM EST", "timestamp": generateRelativeTimestamp(30, 'seconds')},
      {"level": "info", "message": "Calendar invite sent to David Chen and cc'd to your manager", "timestamp": generateRelativeTimestamp(1, 'minutes')}
    ];

    return `Follow-up meeting scheduled successfully:

DASHBOARD_DATA:
{
  "type": "workflow-assistant",
  "metrics": [
    {"label": "Customer", "value": "CloudNine Tech", "status": "success", "icon": "Users", "change": "$32K ARR", "trend": "stable"},
    {"label": "Attendee", "value": "David Chen", "status": "info", "icon": "User", "change": "CTO", "trend": "stable"},
    {"label": "Meeting Time", "value": "Tomorrow 2PM", "status": "success", "icon": "Calendar", "change": "EST (60 min)", "trend": "stable"},
    {"label": "Meeting Type", "value": "Follow-up", "status": "info", "icon": "Phone", "change": "Google Meet", "trend": "stable"},
    {"label": "Related Tickets", "value": "3", "status": "warning", "icon": "FileText", "change": "DESK-1843, 1845", "trend": "stable"},
    {"label": "Invite Status", "value": "✓ Sent", "status": "success", "icon": "Mail", "change": "Accepted", "trend": "stable"},
    {"label": "Manager CC", "value": "✓ Notified", "status": "success", "icon": "Shield", "change": "Michael Torres", "trend": "stable"},
    {"label": "Prep Time", "value": "23h 45m", "status": "info", "icon": "Clock", "change": "Before call", "trend": "stable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Meeting Details:**
- **Date:** Tomorrow, February 2, 2025
- **Time:** 2:00 PM - 3:00 PM EST
- **Location:** Google Meet (link in calendar invite)
- **Agenda:**
  1. Review resolution of DESK-1843 and DESK-1845
  2. Discuss ongoing API integration issues
  3. Present proactive monitoring solution
  4. Schedule weekly check-ins for next month

**Action Items Before Call:**
- [ ] Test fix for DESK-1843 in staging environment
- [ ] Prepare demo of new monitoring dashboard
- [ ] Review CloudNine's account health metrics
- [ ] Coordinate with engineering for technical deep-dive if needed

**Reminder:** CloudNine is high churn risk - make this meeting count!`;
  }

  // ========================================
  // BATCH 1: CS MANAGER - TEAM ANALYTICS
  // ========================================

  // Compare Agent Metrics: Resolution Time vs Customer Satisfaction
  if (messageLower.includes('compare') && messageLower.includes('agent') && (messageLower.includes('resolution') || messageLower.includes('satisfaction') || messageLower.includes('metrics'))) {
    const alerts = [
      {"level": "info", "message": "Sarah Martinez leads in both speed and satisfaction - model agent", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "warning", "message": "Tom Wilson slow resolution (8.2h) with declining CSAT (3.2) - needs coaching", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "info", "message": "Team average: 5.2h resolution time, 4.4 CSAT score", "timestamp": generateRelativeTimestamp(30, 'minutes')}
    ];

    return `Here's a comparison of agent performance metrics:

DASHBOARD_DATA:
{
  "type": "team-analytics",
  "metrics": [
    {"label": "Sarah Martinez", "value": "⭐ Top", "status": "success", "icon": "Award", "change": "4.2h / 4.9 CSAT", "trend": "up", "uptime": "Resolution Time", "lastSync": "CSAT Score"},
    {"label": "Mike Chen", "value": "High", "status": "success", "icon": "TrendingUp", "change": "4.8h / 4.7 CSAT", "trend": "up", "uptime": "Resolution Time", "lastSync": "CSAT Score"},
    {"label": "Emma Wilson", "value": "Good", "status": "info", "icon": "Target", "change": "5.1h / 4.5 CSAT", "trend": "stable", "uptime": "Resolution Time", "lastSync": "CSAT Score"},
    {"label": "Christopher Hayes", "value": "Good", "status": "info", "icon": "CheckCircle2", "change": "5.4h / 4.7 CSAT", "trend": "up", "uptime": "Resolution Time", "lastSync": "CSAT Score"},
    {"label": "Lisa Park", "value": "Average", "status": "info", "icon": "Activity", "change": "5.9h / 4.3 CSAT", "trend": "stable", "uptime": "Resolution Time", "lastSync": "CSAT Score"},
    {"label": "Tom Wilson", "value": "⚠️ Needs Help", "status": "warning", "icon": "AlertTriangle", "change": "8.2h / 3.2 CSAT", "trend": "down", "uptime": "Resolution Time", "lastSync": "CSAT Score"},
    {"label": "Team Average", "value": "Baseline", "status": "info", "icon": "Users", "change": "5.2h / 4.4 CSAT", "trend": "stable", "uptime": "Resolution Time", "lastSync": "CSAT Score"},
    {"label": "Performance Gap", "value": "4.0h spread", "status": "warning", "icon": "BarChart3", "change": "Best to worst", "trend": "stable", "uptime": "Sarah vs Tom", "lastSync": "Significant"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Analysis:** Strong positive correlation between resolution speed and customer satisfaction. Sarah Martinez excels in both (4.2h, 4.9 CSAT). Tom Wilson needs immediate coaching - slowest resolution times correlate with lowest CSAT scores.`;
  }

  // Recommend Ticket Reassignments for Workload Balance
  if (messageLower.includes('reassign') || (messageLower.includes('workload') && messageLower.includes('balance')) || (messageLower.includes('recommend') && messageLower.includes('ticket'))) {
    const alerts = [
      {"level": "warning", "message": "Tom Wilson overloaded: 24 active tickets (team avg: 15) - recommend reassigning 9 tickets", "timestamp": generateRelativeTimestamp(2, 'minutes')},
      {"level": "info", "message": "Sarah Martinez has capacity: 8 active tickets - can take 7 more", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "info", "message": "Mike Chen has capacity: 11 active tickets - can take 4 more", "timestamp": generateRelativeTimestamp(5, 'minutes')}
    ];

    return `Here are recommended ticket reassignments for workload balance:

DASHBOARD_DATA:
{
  "type": "team-operations",
  "metrics": [
    {"label": "Tom Wilson", "value": "Overloaded", "status": "error", "icon": "AlertOctagon", "change": "24 tickets", "trend": "up", "uptime": "160% capacity", "lastSync": "Reassign: 9"},
    {"label": "Sarah Martinez", "value": "Available", "status": "success", "icon": "UserPlus", "change": "8 tickets", "trend": "stable", "uptime": "53% capacity", "lastSync": "Can take: 7"},
    {"label": "Mike Chen", "value": "Available", "status": "success", "icon": "UserPlus", "change": "11 tickets", "trend": "stable", "uptime": "73% capacity", "lastSync": "Can take: 4"},
    {"label": "Emma Wilson", "value": "Balanced", "status": "info", "icon": "Target", "change": "14 tickets", "trend": "stable", "uptime": "93% capacity", "lastSync": "Can take: 1"},
    {"label": "Christopher Hayes", "value": "Balanced", "status": "info", "icon": "CheckCircle2", "change": "15 tickets", "trend": "stable", "uptime": "100% capacity", "lastSync": "At capacity"},
    {"label": "Lisa Park", "value": "High Load", "status": "warning", "icon": "AlertTriangle", "change": "18 tickets", "trend": "up", "uptime": "120% capacity", "lastSync": "Reassign: 3"},
    {"label": "Recommendations", "value": "12 tickets", "status": "warning", "icon": "ArrowRight", "change": "To reassign", "trend": "stable", "uptime": "From: Tom, Lisa", "lastSync": "To: Sarah, Mike"},
    {"label": "Balance Impact", "value": "+18% CSAT", "status": "success", "icon": "TrendingUp", "change": "Projected", "trend": "up", "uptime": "After rebalance", "lastSync": "Estimated"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Recommended Actions:**
1. **Reassign 9 tickets from Tom Wilson:** 5 to Sarah Martinez (similar skill set), 4 to Mike Chen
2. **Reassign 3 tickets from Lisa Park:** 2 to Sarah Martinez, 1 to Emma Wilson
3. **Expected Outcome:** Reduce Tom's workload to 15 tickets (100% capacity), improve his response time and CSAT

**Priority:** High - Tom Wilson's overload is causing team-wide CSAT decline (3.2 vs 4.4 average).`;
  }

  // Escalation Trends and Root Cause Analysis
  if (messageLower.includes('escalation') && messageLower.includes('trend') || (messageLower.includes('root cause') && messageLower.includes('escalation'))) {
    const alerts = [
      {"level": "warning", "message": "Escalations increased 34% in Q4 2025 - driven by API integration issues", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "critical", "message": "December spike: 47 escalations (up from 28 in November)", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "67% of escalations resolved within SLA after manager intervention", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's your escalation trend analysis with root causes:

DASHBOARD_DATA:
{
  "type": "team-analytics",
  "metrics": [
    {"label": "October", "value": "23", "status": "success", "icon": "TrendingDown", "change": "-12% MoM", "trend": "down"},
    {"label": "November", "value": "28", "status": "info", "icon": "TrendingUp", "change": "+22% MoM", "trend": "up"},
    {"label": "December", "value": "47", "status": "error", "icon": "AlertOctagon", "change": "+68% MoM", "trend": "up"},
    {"label": "Q4 Total", "value": "98", "status": "warning", "icon": "BarChart3", "change": "+34% vs Q3", "trend": "up"},
    {"label": "Top Cause #1", "value": "API Issues", "status": "error", "icon": "GitBranch", "change": "32 escalations", "trend": "up", "uptime": "33% of total", "lastSync": "Integration bugs"},
    {"label": "Top Cause #2", "value": "SLA Breach", "status": "warning", "icon": "Clock", "change": "24 escalations", "trend": "up", "uptime": "24% of total", "lastSync": "Capacity issues"},
    {"label": "Top Cause #3", "value": "Complex Tech", "status": "info", "icon": "Settings", "change": "19 escalations", "trend": "stable", "uptime": "19% of total", "lastSync": "Need L2 support"},
    {"label": "Resolution Rate", "value": "67%", "status": "warning", "icon": "CheckCircle2", "change": "Within SLA", "trend": "down", "uptime": "Post-escalation", "lastSync": "Down from 78%"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Root Cause Breakdown:**
1. **API Integration Issues (33%):** Webhook timeouts, authentication errors - need engineering fix
2. **SLA Breach Due to Capacity (24%):** Team overload causing delayed responses - hire 2 agents
3. **Complex Technical Issues (19%):** Require L2/L3 expertise - implement tiered support
4. **Customer Expectations Mismatch (14%):** Onboarding gaps - improve documentation
5. **Product Bugs (10%):** Reported to engineering - faster bug resolution needed

**Recommended Actions:** Focus on API stability (partnering with engineering) and team capacity (hiring) to reduce 57% of escalations.`;
  }

  // ========================================
  // BATCH 2: CS MANAGER - CUSTOMER MANAGEMENT
  // ========================================

  // Which Customers Need Immediate Attention?
  if ((messageLower.includes('customer') || messageLower.includes('account')) && (messageLower.includes('immediate') || messageLower.includes('attention') || messageLower.includes('need'))) {
    const alerts = [
      {"level": "critical", "message": "TechCorp Solutions - 2 critical tickets with SLA breach in 45 minutes", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "critical", "message": "CloudNine Tech - Health score dropped to 28% (churn risk)", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "warning", "message": "Enterprise Corp - No response to 3 support tickets in 5 days", "timestamp": generateRelativeTimestamp(1, 'hours')}
    ];

    return `Here are customers requiring immediate attention:

DASHBOARD_DATA:
{
  "type": "customer-priority",
  "metrics": [
    {"label": "TechCorp Solutions", "value": "CRITICAL", "status": "error", "icon": "AlertOctagon", "change": "$45K ARR", "trend": "down", "uptime": "68% health", "lastSync": "2 P1 tickets", "severity": "critical"},
    {"label": "CloudNine Tech", "value": "CRITICAL", "status": "error", "icon": "XCircle", "change": "$32K ARR", "trend": "down", "uptime": "28% health", "lastSync": "5 open tickets", "severity": "critical"},
    {"label": "Enterprise Corp", "value": "HIGH", "status": "warning", "icon": "AlertTriangle", "change": "$28K ARR", "trend": "down", "uptime": "54% health", "lastSync": "3 unanswered", "severity": "high"},
    {"label": "BizGrowth Inc", "value": "HIGH", "status": "warning", "icon": "AlertCircle", "change": "$22K ARR", "trend": "stable", "uptime": "62% health", "lastSync": "CSAT drop", "severity": "high"},
    {"label": "StartupHub", "value": "MEDIUM", "status": "warning", "icon": "Target", "change": "$18K ARR", "trend": "stable", "uptime": "71% health", "lastSync": "Multiple issues", "severity": "medium"},
    {"label": "Total at Risk", "value": "5 accounts", "status": "error", "icon": "Users", "change": "$145K ARR", "trend": "up"},
    {"label": "Revenue Impact", "value": "$145K", "status": "error", "icon": "TrendingDown", "change": "At risk", "trend": "down"},
    {"label": "Action Needed", "value": "Today", "status": "error", "icon": "Clock", "change": "Urgent", "trend": "stable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Immediate Actions:**
1. **TechCorp**: Escalate DESK-1847 to senior engineer - SLA breach imminent
2. **CloudNine**: Schedule executive call today - 28% health requires intervention
3. **Enterprise Corp**: Personal outreach from account manager - 5 days no response is unacceptable

**Total Revenue at Risk**: $145K ARR from 5 high-value accounts.`;
  }

  // Show Me All High-Priority Tickets by Customer
  if (messageLower.includes('high') && messageLower.includes('priority') && messageLower.includes('ticket') && (messageLower.includes('customer') || messageLower.includes('by'))) {
    const alerts = [
      {"level": "critical", "message": "12 P1 tickets across 8 customers - 3 approaching SLA breach", "timestamp": generateRelativeTimestamp(2, 'minutes')},
      {"level": "warning", "message": "23 P2 tickets - workload imbalance causing delays", "timestamp": generateRelativeTimestamp(10, 'minutes')}
    ];

    return `Here are all high-priority tickets grouped by customer:

DASHBOARD_DATA:
{
  "type": "customer-tickets",
  "metrics": [
    {"label": "TechCorp Solutions", "value": "2 P1", "status": "error", "icon": "AlertOctagon", "change": "DESK-1847, 1843", "trend": "down", "timer": "45m / 3h 20m", "severity": "critical", "customerName": "TechCorp Solutions"},
    {"label": "CloudNine Tech", "value": "2 P1, 3 P2", "status": "error", "icon": "AlertTriangle", "change": "5 tickets", "trend": "up", "timer": "58m / 3h 45m", "severity": "critical", "customerName": "CloudNine Tech"},
    {"label": "Enterprise Corp", "value": "1 P1, 2 P2", "status": "warning", "icon": "AlertCircle", "change": "3 tickets", "trend": "stable", "timer": "2h 15m", "severity": "high", "customerName": "Enterprise Corp"},
    {"label": "BizGrowth Inc", "value": "1 P1, 1 P2", "status": "warning", "icon": "Target", "change": "2 tickets", "trend": "stable", "timer": "4h 10m", "severity": "high", "customerName": "BizGrowth Inc"},
    {"label": "StartupHub", "value": "3 P2", "status": "warning", "icon": "FileText", "change": "3 tickets", "trend": "stable", "timer": "5h 30m", "severity": "medium", "customerName": "StartupHub"},
    {"label": "InnovateStart", "value": "2 P2", "status": "info", "icon": "CheckCircle2", "change": "2 tickets", "trend": "down", "timer": "6h 40m", "severity": "medium", "customerName": "InnovateStart"},
    {"label": "Total P1/P2", "value": "35 tickets", "status": "warning", "icon": "BarChart3", "change": "12 P1 + 23 P2", "trend": "up"},
    {"label": "SLA Breach Risk", "value": "3 tickets", "status": "error", "icon": "Clock", "change": "< 1 hour", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Priority Distribution:** 12 P1 (critical) + 23 P2 (high) = 35 high-priority tickets across 6 major customers. Focus on TechCorp and CloudNine first - multiple P1s with imminent SLA breaches.`;
  }

  // Customers with Multiple Open Tickets
  if ((messageLower.includes('customer') || messageLower.includes('account')) && messageLower.includes('multiple') && messageLower.includes('ticket')) {
    const alerts = [
      {"level": "warning", "message": "CloudNine Tech has 8 open tickets - highest in portfolio (avg: 2.3)", "timestamp": generateRelativeTimestamp(10, 'minutes')},
      {"level": "info", "message": "7 customers have 4+ open tickets - may indicate systemic issues", "timestamp": generateRelativeTimestamp(30, 'minutes')}
    ];

    return `Here are customers with multiple open tickets:

DASHBOARD_DATA:
{
  "type": "customer-tickets",
  "metrics": [
    {"label": "CloudNine Tech", "value": "8 tickets", "status": "error", "icon": "AlertOctagon", "change": "+3 this week", "trend": "up", "customerName": "CloudNine Tech", "uptime": "$32K ARR", "lastSync": "2 P1, 3 P2, 3 P3"},
    {"label": "TechCorp Solutions", "value": "6 tickets", "status": "warning", "icon": "AlertTriangle", "change": "+1 this week", "trend": "up", "customerName": "TechCorp Solutions", "uptime": "$45K ARR", "lastSync": "2 P1, 2 P2, 2 P3"},
    {"label": "Enterprise Corp", "value": "5 tickets", "status": "warning", "icon": "AlertCircle", "change": "Stable", "trend": "stable", "customerName": "Enterprise Corp", "uptime": "$28K ARR", "lastSync": "1 P1, 2 P2, 2 P3"},
    {"label": "BizGrowth Inc", "value": "4 tickets", "status": "warning", "icon": "FileText", "change": "-1 this week", "trend": "down", "customerName": "BizGrowth Inc", "uptime": "$22K ARR", "lastSync": "1 P1, 1 P2, 2 P3"},
    {"label": "StartupHub", "value": "4 tickets", "status": "info", "icon": "Target", "change": "Stable", "trend": "stable", "customerName": "StartupHub", "uptime": "$18K ARR", "lastSync": "0 P1, 3 P2, 1 P3"},
    {"label": "InnovateStart", "value": "4 tickets", "status": "info", "icon": "CheckCircle2", "change": "-2 this week", "trend": "down", "customerName": "InnovateStart", "uptime": "$28K ARR", "lastSync": "0 P1, 2 P2, 2 P3"},
    {"label": "Avg per Customer", "value": "2.3", "status": "info", "icon": "BarChart3", "change": "Portfolio avg", "trend": "stable"},
    {"label": "Trend", "value": "+15%", "status": "warning", "icon": "TrendingUp", "change": "vs last month", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Analysis:** CloudNine Tech is an outlier with 8 open tickets (+3 this week). This suggests either systemic product issues or onboarding gaps. Recommend: Root cause analysis meeting with customer and engineering.`;
  }

  // Accounts with Declining Satisfaction Scores
  if ((messageLower.includes('account') || messageLower.includes('customer')) && (messageLower.includes('declining') || messageLower.includes('drop')) && messageLower.includes('satisfaction')) {
    const alerts = [
      {"level": "critical", "message": "CloudNine Tech CSAT dropped 2.7 points (4.8 → 2.1) in 30 days", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "warning", "message": "TechCorp CSAT down 1.0 point (4.8 → 3.8) - ongoing API issues", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "warning", "message": "6 accounts below 4.0 CSAT threshold - review required", "timestamp": generateRelativeTimestamp(30, 'minutes')}
    ];

    return `Here are accounts with declining satisfaction scores:

DASHBOARD_DATA:
{
  "type": "customer-health",
  "metrics": [
    {"label": "CloudNine Tech", "value": "2.1", "status": "error", "icon": "TrendingDown", "change": "-2.7 (30d)", "trend": "down", "customerName": "CloudNine Tech", "uptime": "Was: 4.8", "lastSync": "Critical drop"},
    {"label": "Enterprise Corp", "value": "2.8", "status": "error", "icon": "AlertOctagon", "change": "-1.5 (30d)", "trend": "down", "customerName": "Enterprise Corp", "uptime": "Was: 4.3", "lastSync": "High risk"},
    {"label": "TechCorp Solutions", "value": "3.8", "status": "warning", "icon": "AlertTriangle", "change": "-1.0 (30d)", "trend": "down", "customerName": "TechCorp Solutions", "uptime": "Was: 4.8", "lastSync": "Concerning"},
    {"label": "BizGrowth Inc", "value": "3.9", "status": "warning", "icon": "AlertCircle", "change": "-0.7 (30d)", "trend": "down", "customerName": "BizGrowth Inc", "uptime": "Was: 4.6", "lastSync": "Watch closely"},
    {"label": "StartupHub", "value": "4.1", "status": "warning", "icon": "TrendingDown", "change": "-0.4 (30d)", "trend": "down", "customerName": "StartupHub", "uptime": "Was: 4.5", "lastSync": "Slight decline"},
    {"label": "DataFlow Systems", "value": "4.3", "status": "info", "icon": "Target", "change": "-0.2 (30d)", "trend": "down", "customerName": "DataFlow Systems", "uptime": "Was: 4.5", "lastSync": "Monitor"},
    {"label": "Accounts < 4.0", "value": "6", "status": "error", "icon": "Users", "change": "Below threshold", "trend": "up"},
    {"label": "Avg Portfolio", "value": "4.2", "status": "warning", "icon": "BarChart3", "change": "-0.5 (30d)", "trend": "down"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Root Causes:**
1. **CloudNine & Enterprise**: Multiple P1 tickets, slow resolution - immediate executive intervention needed
2. **TechCorp**: API integration issues affecting production - engineering escalation required
3. **Overall Decline**: Portfolio CSAT down 0.5 points - team capacity and API stability issues

**Action Plan:** Schedule recovery calls with all accounts < 4.0 CSAT within 48 hours.`;
  }

  // ========================================
  // BATCH 3: CS MANAGER - OPERATIONS
  // ========================================

  // Show Me SLA Breach Risks for Next 24 Hours
  if (messageLower.includes('sla') && messageLower.includes('breach') && (messageLower.includes('risk') || messageLower.includes('24') || messageLower.includes('next') || messageLower.includes('hour'))) {
    const alerts = [
      {"level": "critical", "message": "3 tickets will breach SLA in next hour - immediate action required", "timestamp": generateRelativeTimestamp(1, 'minutes')},
      {"level": "warning", "message": "12 tickets at risk in next 4 hours - recommend reassignments", "timestamp": generateRelativeTimestamp(5, 'minutes')},
      {"level": "info", "message": "23 total tickets need response within 24 hours", "timestamp": generateRelativeTimestamp(10, 'minutes')}
    ];

    return `Here are tickets at risk of SLA breach in the next 24 hours:

DASHBOARD_DATA:
{
  "type": "team-operations",
  "metrics": [
    {"label": "DESK-1847 (TechCorp)", "value": "45m", "status": "error", "icon": "AlertOctagon", "change": "Tom Wilson", "trend": "down", "timer": "45m to breach", "severity": "critical", "ticketId": "DESK-1847"},
    {"label": "DESK-1845 (Enterprise)", "value": "58m", "status": "error", "icon": "XCircle", "change": "Lisa Park", "trend": "down", "timer": "58m to breach", "severity": "critical", "ticketId": "DESK-1845"},
    {"label": "DESK-1844 (CloudNine)", "value": "1h 15m", "status": "error", "icon": "AlertTriangle", "change": "Christopher Hayes", "trend": "down", "timer": "1h 15m to breach", "severity": "critical", "ticketId": "DESK-1844"},
    {"label": "Next 4 Hours", "value": "12 tickets", "status": "warning", "icon": "Clock", "change": "SLA risk", "trend": "up"},
    {"label": "Next 8 Hours", "value": "8 tickets", "status": "warning", "icon": "Timer", "change": "Watch list", "trend": "stable"},
    {"label": "Next 24 Hours", "value": "23 tickets", "status": "info", "icon": "Calendar", "change": "Total at risk", "trend": "stable"},
    {"label": "Breach Impact", "value": "High", "status": "error", "icon": "TrendingDown", "change": "$145K ARR", "trend": "down"},
    {"label": "Recommended Action", "value": "Urgent", "status": "error", "icon": "ArrowRight", "change": "Reassign now", "trend": "stable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Immediate Actions:**
1. **DESK-1847 (45m):** Reassign from Tom Wilson to Sarah Martinez - Tom is overloaded
2. **DESK-1845 (58m):** Escalate to senior engineer - complex technical issue
3. **DESK-1844 (1h 15m):** Alex can handle, but monitor closely

**Risk Mitigation:** Reassign 12 tickets in 4-hour window from overloaded agents (Tom, Lisa) to available capacity (Sarah, Mike). Prevent projected 8 SLA breaches today.`;
  }

  // Team Capacity Planning for Q1 2026
  if ((messageLower.includes('capacity') || messageLower.includes('team')) && messageLower.includes('planning') && (messageLower.includes('q1') || messageLower.includes('2026') || messageLower.includes('quarter'))) {
    const alerts = [
      {"level": "warning", "message": "Projected 28% ticket volume increase in Q1 2026 based on growth trends", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "critical", "message": "Current team at 112% capacity - need 2 new hires by Feb 1st", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "AI automation expected to handle 45% of tickets (up from 38%)", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `Here's your team capacity forecast for Q1 2026:

DASHBOARD_DATA:
{
  "type": "team-operations",
  "metrics": [
    {"label": "Current Capacity", "value": "112%", "status": "error", "icon": "AlertOctagon", "change": "Overloaded", "trend": "up", "uptime": "6 agents", "lastSync": "90 tickets/week"},
    {"label": "Q1 Projected Load", "value": "+28%", "status": "warning", "icon": "TrendingUp", "change": "115 tickets/week", "trend": "up", "uptime": "Growth trend", "lastSync": "From 90/week"},
    {"label": "Gap Without Hiring", "value": "-40%", "status": "error", "icon": "TrendingDown", "change": "Major shortage", "trend": "down", "uptime": "Need action", "lastSync": "By Jan 15"},
    {"label": "Recommended Hires", "value": "2 agents", "status": "warning", "icon": "UserPlus", "change": "By Feb 1st", "trend": "stable", "uptime": "Full-time", "lastSync": "Senior level"},
    {"label": "With 2 New Hires", "value": "95%", "status": "success", "icon": "CheckCircle2", "change": "Optimal", "trend": "stable", "uptime": "8 agents", "lastSync": "115 tickets/week"},
    {"label": "AI Automation", "value": "45%", "status": "success", "icon": "Zap", "change": "+7% vs now", "trend": "up", "uptime": "Expected", "lastSync": "52 tickets/week"},
    {"label": "Cost Impact", "value": "$180K", "status": "info", "icon": "Target", "change": "2 x $90K", "trend": "stable", "uptime": "Annual cost", "lastSync": "Salaries + benefits"},
    {"label": "ROI", "value": "Positive", "status": "success", "icon": "TrendingUp", "change": "$320K saved", "trend": "up", "uptime": "SLA penalties", "lastSync": "Churn prevention"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Capacity Model:**
- **Current:** 6 agents handling 90 tickets/week at 112% capacity (overloaded)
- **Q1 2026 Forecast:** 115 tickets/week (+28% growth)
- **Without Hiring:** Team at 140% capacity → 12-15 SLA breaches/week, high churn risk
- **With 2 New Hires:** 8 agents at 95% capacity → sustainable, high quality

**Financial Analysis:**
- **Investment:** $180K/year (2 senior agents)
- **ROI:** $320K saved (SLA penalties + churn prevention)
- **Payback Period:** 6.8 months

**Recommended Timeline:**
- **Jan 5-15:** Post job openings, screen candidates
- **Jan 16-31:** Interview and extend offers
- **Feb 1:** Start date for new hires
- **Feb 1-28:** Onboarding and training
- **Mar 1:** Fully productive at 100% capacity

**Hiring Priority:** Critical - without action, expect 8-12 customer churn events in Q1 ($250K+ revenue loss).`;
  }

  // ========================================
  // BATCH 1: C-LEVEL - EXECUTIVE OVERVIEW
  // ========================================

  // Executive Dashboard Summary for Board Meeting
  if ((messageLower.includes('executive') || messageLower.includes('board')) && (messageLower.includes('summary') || messageLower.includes('dashboard') || messageLower.includes('meeting'))) {
    const alerts = [
      {"level": "critical", "message": "Customer churn risk: $125K ARR from 5 accounts requires immediate executive intervention", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "SLA performance declining: Q4 at 91.6% (target: 92%) - capacity issues identified", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "AI automation at 38% - opportunity to scale to 50% and save $280K annually", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's your executive dashboard summary for the board meeting:

DASHBOARD_DATA:
{
  "type": "executive-summary",
  "metrics": [
    {"label": "Customer Health", "value": "72%", "status": "warning", "icon": "Users", "change": "-8% QoQ", "trend": "down", "uptime": "Portfolio avg", "lastSync": "5 at risk"},
    {"label": "SLA Performance", "value": "91.6%", "status": "warning", "icon": "Target", "change": "-0.4% QoQ", "trend": "down", "uptime": "Q4 average", "lastSync": "Target: 92%"},
    {"label": "Revenue at Risk", "value": "$125K", "status": "error", "icon": "DollarSign", "change": "5 accounts", "trend": "up", "uptime": "ARR impact", "lastSync": "Immediate action"},
    {"label": "Team Capacity", "value": "112%", "status": "error", "icon": "Activity", "change": "Overloaded", "trend": "up", "uptime": "6 agents", "lastSync": "Need +2 hires"},
    {"label": "CSAT Score", "value": "4.2/5.0", "status": "warning", "icon": "ThumbsUp", "change": "-0.5 pts", "trend": "down", "uptime": "Portfolio", "lastSync": "Below 4.5 target"},
    {"label": "Resolution Time", "value": "5.2h", "status": "info", "icon": "Clock", "change": "+0.8h QoQ", "trend": "up", "uptime": "Team avg", "lastSync": "Capacity driven"},
    {"label": "AI Automation", "value": "38%", "status": "info", "icon": "Zap", "change": "+5% QoQ", "trend": "up", "uptime": "Of tickets", "lastSync": "Target: 50%"},
    {"label": "Escalations", "value": "98", "status": "warning", "icon": "AlertTriangle", "change": "+34% QoQ", "trend": "up", "uptime": "Q4 total", "lastSync": "API issues"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Board Summary:**
**Challenges:** Team operating at 112% capacity due to 28% growth, causing SLA decline (91.6% vs 92% target) and customer health deterioration (72% avg, 5 accounts at risk totaling $125K ARR).

**Root Causes:** (1) Team understaffing - need 2 senior hires by Feb 1st, (2) API integration issues driving 33% of escalations, (3) Capacity constraints impacting CSAT (-0.5 pts to 4.2).

**Strategic Actions:** (1) Immediate hiring ($180K investment, $320K ROI), (2) Engineering partnership for API stability, (3) Scale AI automation from 38% to 50% (save $280K annually).

**Financial Impact:** Without action: $375K revenue loss from churn + SLA penalties in Q1 2026.`;
  }

  // Revenue Impact Analysis from Support Tickets
  if (messageLower.includes('revenue') && messageLower.includes('impact') && (messageLower.includes('support') || messageLower.includes('ticket'))) {
    const alerts = [
      {"level": "critical", "message": "$125K ARR at immediate churn risk due to poor support experience", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "Estimated $85K in SLA penalty credits owed for Q4 2025", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "Fast resolution correlates with 23% higher upsell rate ($420K annual impact)", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's the revenue impact analysis from support operations:

DASHBOARD_DATA:
{
  "type": "revenue-impact",
  "metrics": [
    {"label": "Churn Risk Revenue", "value": "$125K", "status": "error", "icon": "TrendingDown", "change": "5 accounts", "trend": "up", "uptime": "Annual ARR", "lastSync": "At risk now"},
    {"label": "SLA Penalty Credits", "value": "$85K", "status": "error", "icon": "DollarSign", "change": "Q4 2025", "trend": "up", "uptime": "Owed to customers", "lastSync": "127 breaches"},
    {"label": "Upsell Opportunity Loss", "value": "$180K", "status": "warning", "icon": "TrendingUp", "change": "Missed Q4", "trend": "down", "uptime": "Poor CSAT impact", "lastSync": "23% lower rate"},
    {"label": "Total Revenue Impact", "value": "$390K", "status": "error", "icon": "AlertOctagon", "change": "Q4 loss", "trend": "up", "uptime": "Direct + indirect", "lastSync": "Immediate"},
    {"label": "Support Cost per Ticket", "value": "$42", "status": "info", "icon": "Target", "change": "Actual", "trend": "stable", "uptime": "Team + overhead", "lastSync": "vs $38 target"},
    {"label": "AI Cost Savings", "value": "$156K", "status": "success", "icon": "Zap", "change": "Annualized", "trend": "up", "uptime": "38% automation", "lastSync": "3,720 tickets"},
    {"label": "Net Support ROI", "value": "-$234K", "status": "error", "icon": "LineChart", "change": "Q4 2025", "trend": "down", "uptime": "Loss vs gain", "lastSync": "Negative"},
    {"label": "Positive CSAT Revenue Lift", "value": "+$890K", "status": "success", "icon": "ThumbsUp", "change": "Annual", "trend": "up", "uptime": "CSAT > 4.5", "lastSync": "Correlation"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Revenue Analysis:**

**Direct Losses (Q4 2025):**
- Churn risk: $125K ARR (5 accounts with CSAT < 4.0)
- SLA penalties: $85K in contractual credits
- **Subtotal: $210K**

**Opportunity Costs:**
- Upsell rate 23% lower when CSAT < 4.0 → $180K missed revenue
- **Total Q4 Impact: $390K**

**Cost Efficiency:**
- Current cost per ticket: $42 (target: $38) due to capacity constraints
- AI automation saving: $156K annually (38% of tickets auto-resolved)
- **Net Q4 ROI: -$234K (costs exceed savings)**

**Revenue Protection Opportunity:**
- Data shows CSAT > 4.5 correlates with 23% higher upsell rate
- Portfolio with healthy support = +$890K annual revenue
- **Investment Required:** $180K for 2 new hires + $50K API improvements = **$230K**
- **Projected Q1-Q2 2026 Recovery:** +$640K (churn prevention + upsell recovery)
- **ROI: 2.8x in 6 months**`;
  }

  // Customer Satisfaction Scores
  if ((messageLower.includes('customer') || messageLower.includes('csat')) && messageLower.includes('satisfaction') && messageLower.includes('score')) {
    const alerts = [
      {"level": "warning", "message": "Portfolio CSAT declined from 4.7 to 4.2 (-0.5 pts) in Q4", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "critical", "message": "6 accounts below 4.0 CSAT threshold - high churn risk", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "Agent performance spread: 3.2 to 4.9 CSAT - coaching opportunity", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's your customer satisfaction scorecard:

DASHBOARD_DATA:
{
  "type": "customer-satisfaction",
  "metrics": [
    {"label": "Portfolio CSAT", "value": "4.2/5.0", "status": "warning", "icon": "Users", "change": "-0.5 pts (Q4)", "trend": "down", "uptime": "Overall avg", "lastSync": "Below 4.5 target"},
    {"label": "Accounts ≥ 4.5", "value": "32%", "status": "warning", "icon": "ThumbsUp", "change": "18 of 56", "trend": "down", "uptime": "Healthy", "lastSync": "Target: 70%"},
    {"label": "Accounts < 4.0", "value": "11%", "status": "error", "icon": "AlertTriangle", "change": "6 accounts", "trend": "up", "uptime": "At-risk", "lastSync": "$125K ARR"},
    {"label": "Top Performer CSAT", "value": "4.9", "status": "success", "icon": "Award", "change": "Sarah M.", "trend": "up", "uptime": "Best agent", "lastSync": "42 tickets"},
    {"label": "Lowest Performer CSAT", "value": "3.2", "status": "error", "icon": "TrendingDown", "change": "Tom W.", "trend": "down", "uptime": "Needs coaching", "lastSync": "24 tickets"},
    {"label": "First Response CSAT", "value": "4.6", "status": "info", "icon": "Zap", "change": "+0.1 pts", "trend": "up", "uptime": "Speed matters", "lastSync": "< 2h response"},
    {"label": "Resolution CSAT", "value": "4.1", "status": "warning", "icon": "CheckCircle2", "change": "-0.6 pts", "trend": "down", "uptime": "Quality issue", "lastSync": "Fix quality"},
    {"label": "CSAT Trend", "value": "Declining", "status": "error", "icon": "LineChart", "change": "-5.9% QoQ", "trend": "down", "uptime": "Action needed", "lastSync": "Urgent"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**CSAT Analysis:**

**Current State:**
- Portfolio average: 4.2/5.0 (down from 4.7 in Q3)
- Only 32% of accounts at healthy level (≥4.5)
- 6 accounts (11%) below 4.0 = churn risk

**Performance Drivers:**
✅ **Positive:** First response time improved (4.6 CSAT, +0.1)
⚠️ **Negative:** Resolution quality declining (4.1 CSAT, -0.6)

**Agent Variance:**
- Top: Sarah Martinez (4.9 CSAT) - fast + thorough
- Bottom: Tom Wilson (3.2 CSAT) - overloaded (24 tickets)
- **Gap: 1.7 points** - coaching + workload rebalancing opportunity

**Root Causes:**
1. Team capacity at 112% → rushed resolutions
2. API issues causing frustration (32 escalations)
3. Inconsistent agent performance (need training)

**Recovery Plan:**
- Immediate: Reassign 12 tickets from Tom to Sarah/Mike
- Short-term: Executive calls with 6 at-risk accounts
- Long-term: Hire 2 agents, improve API stability
- **Target: 4.7 CSAT by end of Q1 2026**`;
  }

  // Top 10 Accounts by Revenue with Health Scores
  if ((messageLower.includes('top') || messageLower.includes('account')) && messageLower.includes('revenue') && messageLower.includes('health')) {
    const alerts = [
      {"level": "critical", "message": "TechCorp (#1 at $45K ARR) health declining to 68% - escalate immediately", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "warning", "message": "3 of top 10 accounts below 70% health - total $105K ARR at risk", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Top 10 accounts represent 42% of total ARR ($412K of $980K)", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `Here are your top 10 accounts by revenue with health scores:

DASHBOARD_DATA:
{
  "type": "customer-health",
  "metrics": [
    {"label": "#1: TechCorp Solutions", "value": "$45K", "status": "warning", "icon": "AlertTriangle", "change": "68% health", "trend": "down", "uptime": "CSAT: 3.8", "lastSync": "2 P1 tickets"},
    {"label": "#2: InnovateStart", "value": "$38K", "status": "success", "icon": "ThumbsUp", "change": "89% health", "trend": "up", "uptime": "CSAT: 4.7", "lastSync": "No issues"},
    {"label": "#3: CloudNine Tech", "value": "$32K", "status": "error", "icon": "AlertOctagon", "change": "28% health", "trend": "down", "uptime": "CSAT: 2.1", "lastSync": "5 open tickets"},
    {"label": "#4: Enterprise Corp", "value": "$28K", "status": "warning", "icon": "AlertCircle", "change": "54% health", "trend": "down", "uptime": "CSAT: 2.8", "lastSync": "3 unanswered"},
    {"label": "#5: BizGrowth Inc", "value": "$22K", "status": "warning", "icon": "Target", "change": "62% health", "trend": "stable", "uptime": "CSAT: 3.9", "lastSync": "1 P1 ticket"},
    {"label": "#6: DataFlow Systems", "value": "$18K", "status": "success", "icon": "CheckCircle2", "change": "86% health", "trend": "up", "uptime": "CSAT: 4.8", "lastSync": "Strong"},
    {"label": "#7: StartupHub", "value": "$18K", "status": "info", "icon": "Activity", "change": "71% health", "trend": "down", "uptime": "CSAT: 4.1", "lastSync": "Watch"},
    {"label": "#8: FinTech Partners", "value": "$16K", "status": "success", "icon": "TrendingUp", "change": "92% health", "trend": "up", "uptime": "CSAT: 4.9", "lastSync": "Excellent"},
    {"label": "Top 10 Total ARR", "value": "$412K", "status": "info", "icon": "DollarSign", "change": "42% of total", "trend": "stable"},
    {"label": "At-Risk ARR", "value": "$105K", "status": "error", "icon": "TrendingDown", "change": "3 accounts", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Top 10 Account Summary:**

**Healthy Accounts (≥75% health):** 3 accounts, $72K ARR
- #2 InnovateStart: 89% health, 4.7 CSAT ✅
- #6 DataFlow: 86% health, 4.8 CSAT ✅
- #8 FinTech Partners: 92% health, 4.9 CSAT ✅

**At-Risk Accounts (<70% health):** 3 accounts, $105K ARR
- #1 TechCorp: 68% health → API issues, 2 P1 tickets ⚠️
- #3 CloudNine: 28% health → Critical CSAT drop (4.8→2.1) 🚨
- #4 Enterprise Corp: 54% health → No response to 3 tickets 🚨

**Action Plan:**
1. **TODAY:** Executive call with CloudNine Tech (CTO) - $32K ARR at critical risk
2. **This Week:** TechCorp escalation to senior engineer + account review
3. **This Week:** Enterprise Corp personal outreach from VP CS

**Portfolio Health:** 70% overall (target: 85%) - need immediate intervention on top 3 at-risk accounts representing 26% of top 10 ARR.`;
  }

  // ========================================
  // BATCH 2: C-LEVEL - CUSTOMER ANALYTICS
  // ========================================

  // Escalation Trends Over Last 3 Months (C-Level version with more detail)
  if ((messageLower.includes('escalation') && messageLower.includes('trend') && messageLower.includes('3 month')) || (messageLower.includes('escalation') && messageLower.includes('last') && messageLower.includes('month'))) {
    const alerts = [
      {"level": "critical", "message": "47 escalations in December (+68% MoM) - highest in company history", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "API integration issues account for 33% of all escalations - engineering priority needed", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "67% resolution rate post-escalation (target: 80%) - manager intervention improving", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here are escalation trends for the last 3 months:

DASHBOARD_DATA:
{
  "type": "executive-summary",
  "metrics": [
    {"label": "October Total", "value": "23", "status": "success", "icon": "CheckCircle2", "change": "-12% MoM", "trend": "down"},
    {"label": "November Total", "value": "28", "status": "info", "icon": "TrendingUp", "change": "+22% MoM", "trend": "up"},
    {"label": "December Total", "value": "47", "status": "error", "icon": "AlertOctagon", "change": "+68% MoM", "trend": "up"},
    {"label": "Q4 Total", "value": "98", "status": "warning", "icon": "BarChart3", "change": "+34% vs Q3", "trend": "up"},
    {"label": "Avg Time to Resolve", "value": "18.4h", "status": "warning", "icon": "Clock", "change": "+3.2h", "trend": "up"},
    {"label": "Revenue Impact", "value": "$125K", "status": "error", "icon": "DollarSign", "change": "Churn risk", "trend": "up"},
    {"label": "Customer Escalations", "value": "62%", "status": "error", "icon": "Users", "change": "Of total", "trend": "up"},
    {"label": "Resolution SLA", "value": "67%", "status": "error", "icon": "Target", "change": "Target: 80%", "trend": "down"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Q4 Escalation Analysis:**

**Trend:** Accelerating upward - Oct (23) → Nov (28) → Dec (47)

**Root Causes by Category:**
1. **API Integration (33%):** Webhook timeouts, auth errors - need engineering sprint
2. **SLA Breach (24%):** Team capacity constraints - hiring critical
3. **Complex Technical (19%):** Require L2/L3 - implement tiered support
4. **Expectations Gap (14%):** Onboarding issues - improve documentation
5. **Product Bugs (10%):** Engineering backlog - prioritize customer-reported bugs

**Business Impact:**
- 62% are customer-initiated (frustrated customers escalating directly to exec team)
- Average resolution time: 18.4h (up 3.2h) - capacity constraints
- $125K ARR at risk from accounts with multiple escalations

**Strategic Response:**
- Engineering: Dedicate sprint to API stability (reduce 33% of escalations)
- Hiring: Add 2 senior agents (reduce capacity-driven 24%)
- Process: Implement L2/L3 tiered support (reduce technical 19%)
- **Expected Reduction:** 76% of current escalation volume addressable`;
  }

  // Customer Retention Metrics and Forecasts
  if ((messageLower.includes('retention') || messageLower.includes('churn')) && (messageLower.includes('metric') || messageLower.includes('forecast'))) {
    const alerts = [
      {"level": "critical", "message": "Q4 churn rate at 8.2% (up from 5.1% in Q3) - $125K ARR lost", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "Q1 2026 forecast: 12% churn rate if no intervention ($234K ARR at risk)", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "Retention improves 34% when CSAT > 4.5 - focus on customer health", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here are customer retention metrics and Q1 2026 forecast:

DASHBOARD_DATA:
{
  "type": "retention-metrics",
  "metrics": [
    {"label": "Q4 Churn Rate", "value": "8.2%", "status": "error", "icon": "TrendingDown", "change": "+3.1% vs Q3", "trend": "up", "uptime": "5 accounts", "lastSync": "$125K ARR lost"},
    {"label": "Q1 2026 Forecast", "value": "12%", "status": "error", "icon": "AlertOctagon", "change": "If no action", "trend": "up", "uptime": "9 accounts", "lastSync": "$234K at risk"},
    {"label": "Net Revenue Retention", "value": "94%", "status": "warning", "icon": "DollarSign", "change": "-6% QoQ", "trend": "down", "uptime": "Target: 110%", "lastSync": "Below industry"},
    {"label": "Customer Lifetime Value", "value": "$82K", "status": "warning", "icon": "LineChart", "change": "-$18K QoQ", "trend": "down", "uptime": "Avg per account", "lastSync": "Declining"},
    {"label": "Retention by CSAT Tier", "value": "Variable", "status": "info", "icon": "BarChart3", "change": "See details", "trend": "stable", "uptime": "CSAT >4.5: 96%", "lastSync": "CSAT <4.0: 62%"},
    {"label": "Expansion Revenue", "value": "$180K", "status": "warning", "icon": "TrendingUp", "change": "-23% QoQ", "trend": "down", "uptime": "Upsell impact", "lastSync": "CSAT driven"},
    {"label": "Churn Reason #1", "value": "Support Quality", "status": "error", "icon": "Headphones", "change": "62% cite", "trend": "up", "uptime": "Exit surveys", "lastSync": "Fixable"},
    {"label": "Recovery Investment", "value": "$230K", "status": "success", "icon": "Target", "change": "ROI: 2.8x", "trend": "up", "uptime": "6mo payback", "lastSync": "Recommended"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Retention Analysis:**

**Current State (Q4 2025):**
- Churn Rate: 8.2% (vs 5.1% in Q3) 🚨
- ARR Lost: $125K from 5 churned accounts
- Net Revenue Retention: 94% (target: 110%)

**Forecast (Q1 2026 - No Action Scenario):**
- Projected Churn: 12% (9 accounts, $234K ARR)
- Compounding Effect: Lower NRR → reduced CLV → valuation impact

**Retention by Customer Health:**
- CSAT > 4.5: 96% retention (excellent)
- CSAT 4.0-4.5: 84% retention (acceptable)
- CSAT < 4.0: 62% retention (critical) ← **5 accounts here**

**Churn Drivers (Exit Survey Data):**
1. Support quality (62% cite) - slow resolution, poor CSAT
2. Product bugs (24% cite) - unresolved technical issues
3. Pricing (14% cite) - value perception vs support experience

**Recovery Plan:**
- **Investment:** $230K (2 agents + API fixes)
- **Impact:** Improve CSAT from 4.2 → 4.7
- **Result:** Reduce Q1 churn from 12% → 6% (save $117K ARR)
- **ROI:** 2.8x in 6 months + improved NRR trajectory

**Key Insight:** 62% of churn is support-driven and fixable with capacity + quality improvements.`;
  }

  // Resource Allocation Efficiency
  if (messageLower.includes('resource') && messageLower.includes('allocation') && (messageLower.includes('efficiency') || messageLower.includes('optimize'))) {
    const alerts = [
      {"level": "warning", "message": "Team at 112% utilization - inefficient due to context switching and rushed work", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "AI automation at 38% - scaling to 50% would free 15h/week per agent", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "critical", "message": "Workload imbalance: Tom (24 tickets) vs Sarah (8 tickets) - 9 tickets need reassignment", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's your resource allocation efficiency analysis:

DASHBOARD_DATA:
{
  "type": "resource-allocation",
  "metrics": [
    {"label": "Team Utilization", "value": "112%", "status": "error", "icon": "AlertOctagon", "change": "Overloaded", "trend": "up", "uptime": "6 agents", "lastSync": "Inefficient"},
    {"label": "Optimal Utilization", "value": "85-95%", "status": "success", "icon": "Target", "change": "Target range", "trend": "stable", "uptime": "8 agents needed", "lastSync": "+2 hires"},
    {"label": "Workload Balance Score", "value": "42%", "status": "error", "icon": "BarChart3", "change": "Poor", "trend": "down", "uptime": "Tom: 160%", "lastSync": "Sarah: 53%"},
    {"label": "AI Automation Rate", "value": "38%", "status": "info", "icon": "Zap", "change": "Current", "trend": "up", "uptime": "Target: 50%", "lastSync": "+15h/agent"},
    {"label": "Agent Efficiency", "value": "78%", "status": "warning", "icon": "Activity", "change": "vs 92% optimal", "trend": "down", "uptime": "Context switching", "lastSync": "Overload impact"},
    {"label": "Cost per Ticket", "value": "$42", "status": "warning", "icon": "DollarSign", "change": "Actual", "trend": "up", "uptime": "vs $38 target", "lastSync": "+$4 waste"},
    {"label": "Time Allocation: P1", "value": "45%", "status": "info", "icon": "AlertTriangle", "change": "Of agent time", "trend": "stable", "uptime": "12 tickets/week", "lastSync": "Appropriate"},
    {"label": "Time Allocation: Admin", "value": "22%", "status": "warning", "icon": "FileText", "change": "Too high", "trend": "up", "uptime": "vs 15% target", "lastSync": "Reduce"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Resource Efficiency Analysis:**

**Current Allocation Problems:**
1. **Overutilization (112%):** Team beyond sustainable capacity → quality suffers
2. **Imbalance:** 3x variance between most/least loaded agents
3. **Administrative Overhead:** 22% time on admin tasks (target: 15%)
4. **Context Switching:** Agents handling too many simultaneous tickets

**Efficiency Metrics:**
- **Agent Productivity:** 78% (vs 92% optimal) - 14% efficiency loss
- **Cost per Ticket:** $42 (vs $38 target) - $4 waste per ticket
- **Annual Waste:** $4 × 4,680 tickets = **$18.7K in inefficiency**

**Optimization Opportunities:**

**1. Hiring (+2 Agents)**
- Reduce utilization: 112% → 95% (optimal)
- Improve efficiency: 78% → 92% (+18%)
- Cost savings: $42 → $38 per ticket
- **ROI: $18.7K savings + $320K retention = $338K**

**2. Workload Rebalancing (Immediate)**
- Reassign 12 tickets from Tom/Lisa to Sarah/Mike
- Balance utilization: 53-160% → 85-105%
- Reduce context switching → +12% efficiency
- **Cost: $0, Impact: Immediate**

**3. AI Automation Scaling (38% → 50%)**
- Free up 15h/week per agent (90h total)
- Handle +23 tickets/week with same headcount
- Reduce cost per ticket by $6
- **Investment: $50K, Annual savings: $280K**

**Recommended Priority:**
1. Immediate: Rebalance workload (zero cost, instant impact)
2. Short-term: Hire 2 agents (Feb 1 start)
3. Medium-term: Scale AI automation (Q1 2026)`;
  }

  // ========================================
  // BATCH 3: C-LEVEL - STRATEGIC PLANNING
  // ========================================

  // Team Capacity vs Demand Projections
  if ((messageLower.includes('capacity') || messageLower.includes('team')) && messageLower.includes('demand') && (messageLower.includes('vs') || messageLower.includes('projection'))) {
    const alerts = [
      {"level": "critical", "message": "Q1 2026 demand forecast: 115 tickets/week vs current capacity of 82 tickets/week (40% shortfall)", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "Without hiring, expect 12-15 SLA breaches per week and 8-12 churns in Q1", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "With 2 new hires by Feb 1st, capacity matches demand at 95% utilization (optimal)", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's your team capacity vs demand projection analysis:

DASHBOARD_DATA:
{
  "type": "resource-allocation",
  "metrics": [
    {"label": "Current Weekly Demand", "value": "90 tickets", "status": "warning", "icon": "TrendingUp", "change": "+15 vs Q3", "trend": "up"},
    {"label": "Current Weekly Capacity", "value": "82 tickets", "status": "error", "icon": "Users", "change": "6 agents", "trend": "stable", "uptime": "At 100% util", "lastSync": "@ 112% now"},
    {"label": "Current Gap", "value": "-8 tickets", "status": "error", "icon": "TrendingDown", "change": "10% shortage", "trend": "up"},
    {"label": "Q1 2026 Demand Forecast", "value": "115 tickets", "status": "warning", "icon": "LineChart", "change": "+28% growth", "trend": "up"},
    {"label": "Q1 Gap (No Hiring)", "value": "-33 tickets", "status": "error", "icon": "AlertOctagon", "change": "40% shortage", "trend": "up", "uptime": "Catastrophic", "lastSync": "Must avoid"},
    {"label": "With 2 New Hires", "value": "121 tickets", "status": "success", "icon": "UserPlus", "change": "8 agents", "trend": "up", "uptime": "95% utilization", "lastSync": "Optimal"},
    {"label": "Surplus with Hiring", "value": "+6 tickets", "status": "success", "icon": "CheckCircle2", "change": "5% buffer", "trend": "stable", "uptime": "Healthy cushion", "lastSync": "Scalable"},
    {"label": "Break-Even Date", "value": "Mar 15", "status": "info", "icon": "Calendar", "change": "6.8 months", "trend": "stable", "uptime": "ROI timeline", "lastSync": "After Feb 1 start"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Capacity Planning Model:**

**Current State (Dec 2025):**
- Demand: 90 tickets/week
- Capacity: 82 tickets/week (6 agents @ 100%)
- Gap: -8 tickets/week (-10%)
- **Result: Team at 112% utilization (unsustainable)**

**Q1 2026 Forecast - No Hiring Scenario:**
- Demand: 115 tickets/week (+28% growth)
- Capacity: 82 tickets/week (same 6 agents)
- Gap: -33 tickets/week (-40% shortage)
- **Consequences:**
  - 12-15 SLA breaches/week
  - 8-12 customer churns ($250K ARR loss)
  - Team burnout → agent turnover

**Q1 2026 Forecast - With 2 Hires (Feb 1 start):**
- Demand: 115 tickets/week
- Capacity: 121 tickets/week (8 agents @ 95%)
- Surplus: +6 tickets/week (+5% buffer)
- **Benefits:**
  - SLA performance: 91.6% → 95.2%
  - CSAT improvement: 4.2 → 4.7
  - Team efficiency: 78% → 92%
  - Churn reduction: 8.2% → 4.1%

**Financial Model:**
- **Investment:** $180K (2 agents × $90K)
- **Revenue Protected:** $234K (churn prevention)
- **Cost Savings:** $104K (efficiency + SLA penalties avoided)
- **Net Benefit:** $158K in first 6 months
- **ROI: 88% in 6 months, 276% annually**

**Critical Path:** Job postings by Jan 5 → Offers by Jan 31 → Start Feb 1 → Full productivity Mar 1`;
  }

  // Integration ROI Analysis
  if (messageLower.includes('integration') && messageLower.includes('roi')) {
    const alerts = [
      {"level": "info", "message": "Current integrations save estimated 180h/month in manual work ($21.6K annual value)", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "Zoho CRM/Desk integration showing API instability - 33% of escalations", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "Jira integration has 94% adoption rate - high value for technical tickets", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's your integration ROI analysis:

DASHBOARD_DATA:
{
  "type": "integration-roi",
  "metrics": [
    {"label": "Zoho CRM", "value": "$12K/year", "status": "success", "icon": "Database", "change": "ROI: 4.8x", "trend": "up", "uptime": "Investment: $2.5K", "lastSync": "High value"},
    {"label": "Zoho Desk", "value": "$18K/year", "status": "warning", "icon": "Headphones", "change": "ROI: 3.2x", "trend": "down", "uptime": "Investment: $5.6K", "lastSync": "API issues"},
    {"label": "Jira", "value": "$8K/year", "status": "success", "icon": "GitBranch", "change": "ROI: 5.3x", "trend": "up", "uptime": "Investment: $1.5K", "lastSync": "Excellent"},
    {"label": "Google Calendar", "value": "$4K/year", "status": "success", "icon": "Calendar", "change": "ROI: 8.0x", "trend": "up", "uptime": "Investment: $0.5K", "lastSync": "Simple + effective"},
    {"label": "Slack", "value": "$6K/year", "status": "success", "icon": "MessageSquare", "change": "ROI: 6.0x", "trend": "up", "uptime": "Investment: $1K", "lastSync": "Team comms"},
    {"label": "Total Annual Value", "value": "$48K", "status": "success", "icon": "DollarSign", "change": "Time saved", "trend": "up"},
    {"label": "Total Investment", "value": "$11.1K", "status": "info", "icon": "Target", "change": "One-time + annual", "trend": "stable"},
    {"label": "Blended ROI", "value": "4.3x", "status": "success", "icon": "TrendingUp", "change": "Payback: 2.6mo", "trend": "up"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Integration Performance:**

**High ROI Integrations:**
1. **Google Calendar (8.0x ROI):** Simple scheduling automation, near-zero cost
2. **Slack (6.0x ROI):** Team notifications, reduce email clutter
3. **Jira (5.3x ROI):** Engineering ticket linking, 94% adoption
4. **Zoho CRM (4.8x ROI):** Customer data sync, upsell tracking

**Underperforming Integration:**
- **Zoho Desk (3.2x ROI):** API instability causing 33% of escalations
- **Problem:** Webhook timeouts, authentication errors
- **Solution Required:** $50K engineering sprint to stabilize
- **Expected ROI Improvement:** 3.2x → 6.5x after fixes

**Time Savings Breakdown:**
- Manual data entry eliminated: 120h/month
- Automatic ticket routing: 40h/month
- Meeting scheduling automation: 20h/month
- **Total:** 180h/month = $21.6K annually @ $120/hr

**Strategic Recommendations:**
1. **Invest in Zoho Desk Stability:** $50K sprint to fix API issues
   - Eliminate 33% of escalations (32 per quarter)
   - Improve ROI from 3.2x to 6.5x
   - **Payback:** 4.2 months

2. **Expand AI Automation Integration:** $80K investment
   - Scale from 38% to 50% automation
   - Additional $280K annual savings
   - **ROI: 3.5x annually**

**Overall Assessment:** Strong ROI across integrations (4.3x blended). Priority: Fix Zoho Desk stability.`;
  }

  // Competitive Positioning from Customer Feedback
  if (messageLower.includes('competitive') && (messageLower.includes('position') || messageLower.includes('feedback'))) {
    const alerts = [
      {"level": "warning", "message": "27% of customer feedback mentions competitors offering faster support response times", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "AI automation (38%) cited as competitive advantage by 42% of customers", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "critical", "message": "3 accounts mentioned evaluating competitors due to recent support quality decline", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's competitive positioning analysis from customer feedback:

DASHBOARD_DATA:
{
  "type": "competitive-analysis",
  "metrics": [
    {"label": "Response Time vs Competitors", "value": "Behind", "status": "warning", "icon": "Clock", "change": "5.2h vs 3.8h", "trend": "down", "uptime": "Industry avg", "lastSync": "27% cite"},
    {"label": "AI Automation Advantage", "value": "Leading", "status": "success", "icon": "Zap", "change": "38% vs 22%", "trend": "up", "uptime": "Industry avg", "lastSync": "42% cite"},
    {"label": "CSAT vs Competitors", "value": "Below", "status": "warning", "icon": "ThumbsDown", "change": "4.2 vs 4.6", "trend": "down", "uptime": "Industry avg", "lastSync": "18% cite"},
    {"label": "Integration Ecosystem", "value": "Par", "status": "info", "icon": "GitBranch", "change": "5 vs 5-7", "trend": "stable", "uptime": "Industry avg", "lastSync": "Neutral"},
    {"label": "Pricing Competitiveness", "value": "Favorable", "status": "success", "icon": "DollarSign", "change": "+15% value", "trend": "stable", "uptime": "vs competitors", "lastSync": "32% cite"},
    {"label": "Technical Expertise", "value": "Strong", "status": "success", "icon": "Award", "change": "Top 25%", "trend": "up", "uptime": "Industry", "lastSync": "38% cite"},
    {"label": "Churn to Competitors", "value": "3 accounts", "status": "error", "icon": "AlertTriangle", "change": "Q4 2025", "trend": "up", "uptime": "Evaluating", "lastSync": "$85K ARR"},
    {"label": "Win-Back Opportunity", "value": "High", "status": "info", "icon": "Target", "change": "If fixed Q1", "trend": "stable", "uptime": "Support-driven", "lastSync": "Recoverable"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Competitive Analysis from Feedback:**

**Strengths vs Competitors:**
✅ **AI Automation (Leading):** 38% vs industry 22% - customers cite as major differentiator
✅ **Technical Expertise:** Top 25% - complex issue resolution praised
✅ **Pricing:** 15% better value perception vs alternatives

**Weaknesses vs Competitors:**
⚠️ **Response Time (Behind):** 5.2h vs industry 3.8h - capacity constraints showing
⚠️ **CSAT (Below):** 4.2 vs industry 4.6 - quality decline hurting positioning
⚠️ **Consistency:** High variance (Sarah 4.9 vs Tom 3.2) - competitors more consistent

**Churn Risk - Competitive Threats:**
- **3 accounts actively evaluating competitors** ($85K ARR)
- Primary drivers: Slow response times, recent quality decline
- Competitive alternatives mentioned: Zendesk, Freshdesk, Intercom

**Customer Sentiment Quotes:**
- *"Love the AI automation but response times have gotten worse"* (TechCorp)
- *"Considering [Competitor X] - they promise <2h first response"* (CloudNine)
- *"Support quality inconsistent - sometimes great, sometimes terrible"* (Enterprise Corp)

**Competitive Positioning Strategy:**

**Defend Strengths:**
1. Scale AI automation 38% → 50% (maintain lead)
2. Promote technical expertise in marketing
3. Maintain pricing advantage

**Address Weaknesses:**
1. **Response Time:** Hire 2 agents → target 3.5h (beat industry 3.8h)
2. **CSAT:** Improve to 4.7 (above industry 4.6)
3. **Consistency:** Training program to reduce agent variance

**Win-Back Plan for 3 At-Risk Accounts:**
- Executive engagement + SLA guarantees
- Dedicated senior agent assignment
- Monthly QBRs with success metrics
- **Investment:** $15K, **Recovery:** $85K ARR`;
  }

  // ============================================
  // ADMIN PERSONA QUERIES - Cross-Department Analytics
  // ============================================

  // 1. Compare performance across all departments
  if ((messageLower.includes('compare') || messageLower.includes('performance')) && (messageLower.includes('department') || messageLower.includes('all'))) {
    const alerts = [
      {"level": "critical", "message": "CS Team operating at 112% capacity - highest workload across all departments", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "warning", "message": "Engineering Support team has 18% lower CSAT than company average (4.1 vs 4.5)", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Sales Support team leads in efficiency: 82% first-contact resolution rate", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "info", "message": "Billing team showing consistent improvement: +12% CSAT over last quarter", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's performance comparison across all departments:

DASHBOARD_DATA:
{
  "type": "cross-department",
  "metrics": [
    {"label": "Customer Success", "value": "112%", "status": "error", "icon": "Users", "change": "Capacity", "trend": "up", "uptime": "CSAT: 4.6", "lastSync": "15 agents"},
    {"label": "Engineering Support", "value": "87%", "status": "warning", "icon": "Wrench", "change": "Capacity", "trend": "stable", "uptime": "CSAT: 4.1", "lastSync": "8 agents"},
    {"label": "Sales Support", "value": "72%", "status": "success", "icon": "DollarSign", "change": "Capacity", "trend": "stable", "uptime": "CSAT: 4.8", "lastSync": "6 agents"},
    {"label": "Billing Support", "value": "68%", "status": "success", "icon": "CreditCard", "change": "Capacity", "trend": "down", "uptime": "CSAT: 4.4", "lastSync": "4 agents"},
    {"label": "Technical Support", "value": "95%", "status": "warning", "icon": "Settings", "change": "Capacity", "trend": "up", "uptime": "CSAT: 4.5", "lastSync": "12 agents"},
    {"label": "Onboarding Team", "value": "58%", "status": "success", "icon": "UserPlus", "change": "Capacity", "trend": "stable", "uptime": "CSAT: 4.9", "lastSync": "5 agents"},
    {"label": "Platform avg CSAT", "value": "4.5", "status": "success", "icon": "Award", "change": "+0.2 vs Q3", "trend": "up", "uptime": "Company target", "lastSync": "50 agents"},
    {"label": "Overall Capacity", "value": "88%", "status": "warning", "icon": "Activity", "change": "All departments", "trend": "up", "uptime": "Target: 80%", "lastSync": "Peak season"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Department Performance Analysis:**

**🔴 Critical Capacity Issues:**
- **Customer Success:** 112% capacity (15 agents, 168 tickets) - immediate hiring needed
- **Technical Support:** 95% capacity (12 agents, 114 tickets) - approaching threshold

**⚠️ Quality Concerns:**
- **Engineering Support:** CSAT 4.1 (18% below avg) - training gap identified
- Root cause: Complex technical issues, avg resolution time 8.2h vs 5.1h platform avg

**✅ Top Performers:**
- **Sales Support:** 82% first-contact resolution, 4.8 CSAT, 72% capacity - best practices model
- **Onboarding Team:** 4.9 CSAT, 58% capacity - consistent high quality, room for growth

**Recommendations:**
1. **Immediate:** Hire 3 CS agents ($180K investment, reduce to 85% capacity)
2. **Q1 2026:** Engineering Support training program (focus on complex issue handling)
3. **Best Practice Sharing:** Implement Sales Support's workflow across Technical Support team
4. **Capacity Planning:** Add 2 Technical Support agents by March 2026

**Projected Impact:** $640K revenue protection, +0.3 CSAT improvement, -15% average resolution time`;
  }

  // 2. Show me aggregate metrics for executive summary
  if (messageLower.includes('aggregate') && (messageLower.includes('metric') || messageLower.includes('executive') || messageLower.includes('summary'))) {
    const alerts = [
      {"level": "info", "message": "Platform processed 2,847 tickets this week - 28% increase over last week", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "warning", "message": "Average resolution time increased to 6.2h (target: 5.5h) - capacity constraints identified", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "AI automation handling 38% of total volume - saved 342 agent hours this week", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `Here are aggregate metrics for executive summary:

DASHBOARD_DATA:
{
  "type": "executive-summary",
  "metrics": [
    {"label": "Total Tickets (Week)", "value": "2,847", "status": "info", "icon": "FileText", "change": "+28% vs last week", "trend": "up", "uptime": "All departments", "lastSync": "${generateRelativeTimestamp(5, 'minutes')}"},
    {"label": "Platform CSAT", "value": "4.5", "status": "success", "icon": "Award", "change": "+0.2 vs Q3", "trend": "up", "uptime": "Target: 4.3", "lastSync": "847 responses"},
    {"label": "SLA Performance", "value": "91.6%", "status": "warning", "icon": "Target", "change": "-0.8% vs Q3", "trend": "down", "uptime": "Target: 92%", "lastSync": "127 breaches"},
    {"label": "Avg Resolution Time", "value": "6.2h", "status": "warning", "icon": "Clock", "change": "+0.7h vs target", "trend": "up", "uptime": "Target: 5.5h", "lastSync": "All tickets"},
    {"label": "Active Agents", "value": "50", "status": "success", "icon": "Users", "change": "6 teams", "trend": "stable", "uptime": "Platform capacity", "lastSync": "88% utilized"},
    {"label": "AI Automation", "value": "38%", "status": "success", "icon": "Zap", "change": "+5% QoQ", "trend": "up", "uptime": "342h saved", "lastSync": "1,082 tickets"},
    {"label": "Revenue at Risk", "value": "$125K", "status": "error", "icon": "TrendingDown", "change": "5 accounts", "trend": "up", "uptime": "Churn risk", "lastSync": "Immediate action"},
    {"label": "Customer Health", "value": "72%", "status": "warning", "icon": "Heart", "change": "-8% QoQ", "trend": "down", "uptime": "Portfolio avg", "lastSync": "248 accounts"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Executive Summary - Platform-Wide Metrics:**

**📊 Volume & Capacity:**
- **Tickets:** 2,847 this week (+28% growth) - seasonal spike + new customer onboarding
- **Team Capacity:** 88% average (50 agents across 6 departments)
- **Critical:** Customer Success at 112% capacity - immediate hiring required

**📈 Quality & Performance:**
- **CSAT:** 4.5/5.0 (exceeding 4.3 target) - strong customer satisfaction despite volume
- **SLA:** 91.6% (below 92% target) - capacity constraints causing 127 breaches
- **Resolution Time:** 6.2h average (target: 5.5h) - +0.7h due to workload pressure

**🤖 AI Impact:**
- **Automation Rate:** 38% of total volume (1,082 tickets this week)
- **Agent Time Saved:** 342 hours - equivalent to 8.5 full-time agents
- **Growth:** +5% QoQ - scaling AI to reduce human workload

**💰 Business Impact:**
- **Revenue at Risk:** $125K ARR from 5 accounts with declining health scores
- **Customer Health:** 72% portfolio average (-8% QoQ) - capacity issues affecting relationships
- **Cost of Inaction:** Projected $375K revenue loss in Q1 2026 without intervention

**Strategic Recommendations:**
1. **Immediate Hiring:** 3 CS agents ($180K) to reduce capacity to 85%
2. **Process Optimization:** Scale AI from 38% to 50% (+$90K ROI in 6 months)
3. **Quality Focus:** Engineering Support training to improve 4.1 CSAT
4. **Customer Success:** Executive intervention for 5 at-risk accounts ($125K ARR)

**Investment:** $270K total, **Expected Return:** $730K revenue protection + efficiency gains`;
  }

  // 3. Which teams have the highest workload?
  if (messageLower.includes('team') && messageLower.includes('workload') && (messageLower.includes('highest') || messageLower.includes('most'))) {
    const alerts = [
      {"level": "critical", "message": "Customer Success team critically overloaded: 112% capacity with 168 active tickets", "timestamp": generateRelativeTimestamp(10, 'minutes')},
      {"level": "warning", "message": "Technical Support approaching capacity threshold: 95% with 114 active tickets", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "info", "message": "Engineering Support team workload sustainable at 87% capacity with proper distribution", "timestamp": generateRelativeTimestamp(1, 'hours')}
    ];

    return `Here are teams ranked by workload from highest to lowest:

DASHBOARD_DATA:
{
  "type": "cross-department",
  "metrics": [
    {"label": "Customer Success", "value": "112%", "status": "error", "icon": "AlertOctagon", "change": "168 tickets", "trend": "up", "uptime": "15 agents", "lastSync": "11.2 avg/agent"},
    {"label": "Technical Support", "value": "95%", "status": "warning", "icon": "AlertTriangle", "change": "114 tickets", "trend": "up", "uptime": "12 agents", "lastSync": "9.5 avg/agent"},
    {"label": "Engineering Support", "value": "87%", "status": "warning", "icon": "Activity", "change": "70 tickets", "trend": "stable", "uptime": "8 agents", "lastSync": "8.8 avg/agent"},
    {"label": "Sales Support", "value": "72%", "status": "success", "icon": "TrendingUp", "change": "43 tickets", "trend": "stable", "uptime": "6 agents", "lastSync": "7.2 avg/agent"},
    {"label": "Billing Support", "value": "68%", "status": "success", "icon": "CheckCircle", "change": "27 tickets", "trend": "down", "uptime": "4 agents", "lastSync": "6.8 avg/agent"},
    {"label": "Onboarding Team", "value": "58%", "status": "success", "icon": "UserCheck", "change": "29 tickets", "trend": "stable", "uptime": "5 agents", "lastSync": "5.8 avg/agent"},
    {"label": "Platform Average", "value": "88%", "status": "warning", "icon": "BarChart3", "change": "451 total", "trend": "up", "uptime": "50 agents", "lastSync": "9.0 avg/agent"},
    {"label": "Workload Distribution", "value": "Unbalanced", "status": "warning", "icon": "Scale", "change": "54% variance", "trend": "stable", "uptime": "High/Low gap", "lastSync": "Rebalance needed"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Team Workload Analysis (Highest to Lowest):**

**🔴 Critical Overload:**
**1. Customer Success - 112% Capacity** (IMMEDIATE ACTION REQUIRED)
- **Load:** 168 active tickets across 15 agents (11.2 tickets/agent)
- **Impact:** SLA breaches increasing, agent burnout risk, customer satisfaction declining
- **Root Cause:** 28% ticket volume growth + limited hiring
- **Recommendation:** Hire 3 agents immediately ($180K investment) → reduce to 85% capacity
- **Timeline:** Critical - cannot sustain beyond 2 weeks

**⚠️ Near Capacity Threshold:**
**2. Technical Support - 95% Capacity** (WATCH CLOSELY)
- **Load:** 114 active tickets across 12 agents (9.5 tickets/agent)
- **Status:** Sustainable short-term, will breach threshold in 7-10 days at current growth
- **Recommendation:** Add 2 agents by March 2026, optimize ticket routing

**3. Engineering Support - 87% Capacity** (MANAGEABLE)
- **Load:** 70 active tickets across 8 agents (8.8 tickets/agent)
- **Status:** Sustainable with current resources
- **Note:** Quality concern (CSAT 4.1) requires training, not additional headcount

**✅ Healthy Capacity:**
**4. Sales Support - 72% Capacity**
- Best practice team: 82% first-contact resolution, 4.8 CSAT
- Room for additional 2 tickets/agent without quality impact

**5. Billing Support - 68% Capacity**
- Efficient operations, declining trend due to improved self-service tools

**6. Onboarding Team - 58% Capacity**
- Highest quality (4.9 CSAT), significant room for growth
- Can absorb 20% more load without risk

**Workload Distribution Issues:**
- **Variance:** 54% gap between highest (112%) and lowest (58%) capacity
- **Imbalance Impact:** Overworked teams declining quality while underutilized teams idle
- **Recommendation:** Implement cross-training program for workload flexibility

**Strategic Actions:**
1. **Immediate (Week 1):** Post 3 CS agent positions, start interviews
2. **Short-term (30 days):** Implement ticket routing optimization to balance load
3. **Medium-term (Q1 2026):** Cross-train Onboarding team on CS workflows
4. **Long-term:** Dynamic workload balancing system with AI-powered routing`;
  }

  // 4. User access report for compliance
  if ((messageLower.includes('user') || messageLower.includes('access')) && messageLower.includes('compliance')) {
    const alerts = [
      {"level": "warning", "message": "12 users with inactive status still have active system access - security risk", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "critical", "message": "3 admin accounts lack MFA enforcement - violates security policy", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Quarterly access review due in 14 days - 248 user accounts to audit", "timestamp": generateRelativeTimestamp(2, 'hours')},
      {"level": "warning", "message": "8 users with C-Level role haven't logged in for 60+ days", "timestamp": generateRelativeTimestamp(3, 'hours')}
    ];

    return `Here's the user access report for compliance:

DASHBOARD_DATA:
{
  "type": "system-compliance",
  "metrics": [
    {"label": "Total User Accounts", "value": "248", "status": "info", "icon": "Users", "change": "Active system", "trend": "stable", "uptime": "All roles", "lastSync": generateRelativeTimestamp(5, 'minutes')},
    {"label": "C-Level Accounts", "value": "12", "status": "success", "icon": "Shield", "change": "4 active", "trend": "stable", "uptime": "8 inactive", "lastSync": "View-only access"},
    {"label": "CS Manager Accounts", "value": "18", "status": "success", "icon": "UserCog", "change": "18 active", "trend": "stable", "uptime": "0 inactive", "lastSync": "Full team access"},
    {"label": "Support Agent Accounts", "value": "156", "status": "success", "icon": "Headphones", "change": "144 active", "trend": "stable", "uptime": "12 inactive", "lastSync": "Queue access"},
    {"label": "Admin Accounts", "value": "8", "status": "warning", "icon": "Key", "change": "8 active", "trend": "stable", "uptime": "3 no MFA", "lastSync": "Security gap"},
    {"label": "External Contractor", "value": "54", "status": "info", "icon": "UserCheck", "change": "42 active", "trend": "stable", "uptime": "12 inactive", "lastSync": "Limited access"},
    {"label": "Compliance Status", "value": "82%", "status": "warning", "icon": "FileCheck", "change": "15 issues", "trend": "stable", "uptime": "Target: 100%", "lastSync": "Action required"},
    {"label": "Last Audit", "value": "78 days", "status": "warning", "icon": "Calendar", "change": "Q4 review", "trend": "stable", "uptime": "Due in 14 days", "lastSync": "Quarterly cycle"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**User Access & Compliance Report:**

**📊 Account Summary:**
- **Total Users:** 248 accounts (174 active, 74 inactive)
- **By Role:** 12 C-Level, 18 CS Managers, 156 Support Agents, 8 Admins, 54 Contractors
- **Access Pattern:** 70% active in last 30 days, 30% inactive or dormant

**🔒 Security Compliance Issues:**

**Critical (3 issues):**
1. **Admin MFA Enforcement:** 3/8 admin accounts lack MFA (37.5%)
   - **Risk:** High - admin accounts can modify system-wide settings
   - **Remediation:** Enforce MFA within 48 hours, disable non-compliant accounts
   - **Policy:** SOC 2 requires MFA for all privileged accounts

**High Priority (12 issues):**
2. **Inactive Users with Access:** 12 users marked inactive still have system access
   - **Breakdown:** 8 former employees, 4 contractors (projects ended)
   - **Risk:** Medium - dormant accounts vulnerable to credential theft
   - **Remediation:** Immediate access revocation, password reset required for reactivation

**Medium Priority (8 issues):**
3. **Dormant C-Level Accounts:** 8 C-Level users haven't logged in for 60+ days
   - **Note:** View-only access, low risk but violates least-privilege principle
   - **Recommendation:** Archive accounts, reactivate on-demand

**✅ Compliance Strengths:**
- **Role Segregation:** Proper separation of duties across 4 role types
- **Agent Access:** 92% of support agents active with proper queue assignments
- **Contractor Management:** 54 contractors with limited, time-bound access
- **Audit Trail:** Complete access logs for last 90 days

**📋 Upcoming Requirements:**
- **Quarterly Access Review:** Due in 14 days (all 248 accounts)
- **SOC 2 Audit Prep:** Resolve 15 compliance issues before review
- **Annual Certification:** Manager attestation for team access rights (due Q1 2026)

**Remediation Plan:**
**Phase 1 (48 hours):**
- Enforce MFA on 3 admin accounts (critical)
- Disable 12 inactive user accounts (high priority)
- Generate access report for quarterly review

**Phase 2 (7 days):**
- Archive 8 dormant C-Level accounts
- Review and update 54 contractor access expiration dates
- Implement automated dormant account alerts (60-day threshold)

**Phase 3 (30 days):**
- Complete quarterly access review (248 accounts)
- Document role-based access control (RBAC) policy updates
- Implement just-in-time (JIT) access for contractors

**Compliance Score:** 82% (Target: 100%)
**Timeline to Full Compliance:** 30 days with phased remediation`;
  }

  // 5. Review webhook configurations
  if (messageLower.includes('webhook') && (messageLower.includes('config') || messageLower.includes('review'))) {
    const alerts = [
      {"level": "critical", "message": "Zoho CRM webhook failing: 127 consecutive failures in last 4 hours", "timestamp": generateRelativeTimestamp(15, 'minutes')},
      {"level": "warning", "message": "Jira webhook experiencing intermittent timeouts: 18% failure rate", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "info", "message": "Slack notification webhook performing optimally: 99.8% success rate", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "warning", "message": "3 webhooks missing retry configuration - potential data loss risk", "timestamp": generateRelativeTimestamp(2, 'hours')}
    ];

    return `Here's the webhook configuration review:

DASHBOARD_DATA:
{
  "type": "webhook-config",
  "metrics": [
    {"label": "Zoho CRM Webhook", "value": "Failing", "status": "error", "icon": "XCircle", "change": "127 failures", "trend": "down", "uptime": "0% (4h)", "lastSync": "Auth expired"},
    {"label": "Jira Integration", "value": "Degraded", "status": "warning", "icon": "AlertTriangle", "change": "18% failures", "trend": "down", "uptime": "82% (24h)", "lastSync": "Timeouts"},
    {"label": "Slack Notifications", "value": "Healthy", "status": "success", "icon": "CheckCircle", "change": "99.8% success", "trend": "stable", "uptime": "99.8% (7d)", "lastSync": generateRelativeTimestamp(2, 'minutes')},
    {"label": "Google Calendar", "value": "Healthy", "status": "success", "icon": "Calendar", "change": "98.2% success", "trend": "stable", "uptime": "98.2% (7d)", "lastSync": generateRelativeTimestamp(8, 'minutes')},
    {"label": "Email Gateway", "value": "Healthy", "status": "success", "icon": "Mail", "change": "99.5% success", "trend": "stable", "uptime": "99.5% (7d)", "lastSync": generateRelativeTimestamp(1, 'minutes')},
    {"label": "GitHub Issues", "value": "Idle", "status": "info", "icon": "GitBranch", "change": "No activity", "trend": "stable", "uptime": "N/A", "lastSync": "30+ days"},
    {"label": "Total Webhooks", "value": "12", "status": "info", "icon": "Webhook", "change": "8 active", "trend": "stable", "uptime": "4 idle", "lastSync": "System-wide"},
    {"label": "Avg Success Rate", "value": "87.4%", "status": "warning", "icon": "Activity", "change": "7d average", "trend": "down", "uptime": "Target: 95%", "lastSync": "Impact: Medium"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Webhook Configuration Review:**

**🔴 Critical Issues:**

**1. Zoho CRM Webhook - COMPLETE FAILURE**
- **Status:** Failing for 4 hours (127 consecutive failures)
- **Root Cause:** OAuth token expired (last refresh: 62 days ago)
- **Impact:** HIGH - No customer data sync, support agents missing critical CRM context
- **Data Loss:** ~340 customer interactions not synced to CRM
- **Remediation:**
  1. Refresh OAuth token immediately (5 min)
  2. Implement token auto-refresh (30-day cycle)
  3. Backfill 340 missing interactions (estimate: 2 hours)
- **Timeline:** IMMEDIATE - customer data integrity at risk

**⚠️ Performance Issues:**

**2. Jira Integration Webhook - DEGRADED**
- **Status:** 82% success rate (18% timeouts)
- **Root Cause:** Jira API experiencing intermittent latency (avg response: 8.2s, timeout set: 5s)
- **Impact:** MEDIUM - Some issue links failing to create, manual intervention required
- **Affected:** 23 tickets in last 24 hours had failed Jira links
- **Remediation:**
  1. Increase timeout from 5s to 12s (immediate)
  2. Implement exponential backoff retry (3 attempts)
  3. Add webhook queue for failed attempts (persistent storage)
- **Timeline:** Deploy fix within 4 hours

**3. Missing Retry Configurations - DATA LOSS RISK**
- **Affected Webhooks:** GitHub Issues, Custom API Endpoint, Analytics Tracker
- **Risk:** Failed webhooks not retried - data permanently lost
- **Recommendation:** Implement retry logic (3 attempts, exponential backoff: 1s, 5s, 25s)

**✅ Healthy Webhooks:**

- **Slack Notifications:** 99.8% success (excellent)
  - Configuration: 3 retry attempts, 30s timeout, queue-based
  - Volume: ~450 notifications/day

- **Google Calendar:** 98.2% success (good)
  - Configuration: 2 retry attempts, 15s timeout
  - Volume: ~120 events/day

- **Email Gateway:** 99.5% success (excellent)
  - Configuration: 5 retry attempts, 45s timeout, persistent queue
  - Volume: ~1,200 emails/day

**📊 Webhook Inventory:**

**Active Webhooks (8):**
1. Zoho CRM (failing)
2. Jira Integration (degraded)
3. Slack Notifications (healthy)
4. Google Calendar (healthy)
5. Email Gateway (healthy)
6. Zendesk Sync (healthy - 96.8%)
7. Analytics Dashboard (healthy - 97.2%)
8. Customer Portal API (healthy - 98.9%)

**Idle Webhooks (4):**
- GitHub Issues (no activity 30+ days)
- Trello Integration (deprecated)
- HubSpot CRM (migrated to Zoho)
- Legacy Notification Service (replaced by Slack)

**Configuration Standards:**
- **Timeout:** 10-30s (based on endpoint SLA)
- **Retries:** Minimum 3 attempts with exponential backoff
- **Monitoring:** Success rate tracking with 95% SLA threshold
- **Alerting:** Critical alert at <90%, warning at <95%

**Remediation Priority:**

**🔥 Immediate (Next 1 hour):**
1. Refresh Zoho OAuth token
2. Backfill 340 missing CRM interactions
3. Increase Jira timeout to 12s

**⚠️ High Priority (Next 24 hours):**
1. Implement retry logic for Jira webhook
2. Add retry configuration to 3 missing webhooks
3. Set up automated token refresh for Zoho (30-day cycle)

**📋 Medium Priority (Next 7 days):**
1. Decommission 4 idle webhooks to reduce noise
2. Standardize retry configuration across all webhooks
3. Implement centralized webhook monitoring dashboard
4. Document webhook configuration standards

**Expected Outcome:**
- **Zoho CRM:** Restored to 99%+ success rate
- **Jira Integration:** Improved to 95%+ success rate
- **Platform Average:** Increase from 87.4% to 96%+
- **Data Integrity:** Zero data loss with retry mechanisms`;
  }

  // 6. Database performance metrics
  if (messageLower.includes('database') && (messageLower.includes('performance') || messageLower.includes('metric'))) {
    const alerts = [
      {"level": "warning", "message": "Connection pool at 87% utilization - approaching max capacity of 100 connections", "timestamp": generateRelativeTimestamp(10, 'minutes')},
      {"level": "info", "message": "Query cache hit ratio: 94.2% - performing well above 85% target", "timestamp": generateRelativeTimestamp(30, 'minutes')},
      {"level": "warning", "message": "3 slow queries identified (>2s execution time) - optimization candidates", "timestamp": generateRelativeTimestamp(1, 'hours')},
      {"level": "info", "message": "Last backup completed successfully 4 hours ago - next scheduled in 20 hours", "timestamp": generateRelativeTimestamp(4, 'hours')}
    ];

    return `Here are the database performance metrics:

DASHBOARD_DATA:
{
  "type": "system-health",
  "metrics": [
    {"label": "Connection Pool", "value": "87%", "status": "warning", "icon": "Link", "change": "87/100", "trend": "up", "uptime": "Peak usage", "lastSync": "Add capacity"},
    {"label": "Query Response Time", "value": "142ms", "status": "success", "icon": "Zap", "change": "Avg (24h)", "trend": "stable", "uptime": "Target: <200ms", "lastSync": "Healthy"},
    {"label": "Cache Hit Ratio", "value": "94.2%", "status": "success", "icon": "Target", "change": "Query cache", "trend": "up", "uptime": "Target: >85%", "lastSync": "Excellent"},
    {"label": "Active Connections", "value": "87", "status": "warning", "icon": "Users", "change": "Real-time", "trend": "stable", "uptime": "Max: 100", "lastSync": generateRelativeTimestamp(1, 'minutes')},
    {"label": "Slow Queries (>2s)", "value": "3", "status": "warning", "icon": "AlertTriangle", "change": "Last 24h", "trend": "stable", "uptime": "Optimize", "lastSync": "Review needed"},
    {"label": "Database Size", "value": "84 GB", "status": "success", "icon": "Database", "change": "+2.1 GB/week", "trend": "up", "uptime": "Provisioned: 250GB", "lastSync": "34% used"},
    {"label": "Last Backup", "value": "4h ago", "status": "success", "icon": "HardDrive", "change": "Successful", "trend": "stable", "uptime": "Daily schedule", "lastSync": "Next: 20h"},
    {"label": "Replication Lag", "value": "18ms", "status": "success", "icon": "RotateCw", "change": "Primary→Replica", "trend": "stable", "uptime": "Target: <100ms", "lastSync": "Healthy"}
  ],
  "alerts": ${JSON.stringify(alerts)}
}

**Database Performance Analysis:**

**📊 Overall Health: GOOD** (Minor optimization needed)

**Connection Management:**
- **Current:** 87/100 connections (87% utilization)
- **Status:** ⚠️ Approaching capacity threshold (>80%)
- **Peak Times:** 10 AM - 4 PM EST (82-87 connections)
- **Off-Peak:** 2 AM - 6 AM EST (12-18 connections)
- **Recommendation:**
  - Increase connection pool to 150 connections (66% headroom)
  - Implement connection pooling optimization (reduce idle time from 30s to 15s)
  - Expected cost: $45/month for larger instance, prevents bottlenecks

**⚡ Query Performance:**
- **Average Response Time:** 142ms (✅ well below 200ms target)
- **95th Percentile:** 420ms (acceptable)
- **99th Percentile:** 1.8s (3 outlier queries)
- **Cache Hit Ratio:** 94.2% (✅ excellent - target >85%)

**🐌 Slow Query Analysis:**

**Query 1: Customer Health Dashboard**
- **Execution Time:** 2.4s
- **Frequency:** 87 times/day (triggered by C-Level users)
- **Issue:** Full table scan on 248K ticket records, missing composite index
- **Fix:** Add index on (customer_id, created_at, status) - reduces to <200ms
- **Impact:** HIGH - affects executive dashboard load time

**Query 2: Agent Performance Report**
- **Execution Time:** 3.1s
- **Frequency:** 42 times/day (CS Manager morning reviews)
- **Issue:** Complex JOIN across 4 tables without proper indexing
- **Fix:** Implement materialized view with hourly refresh - reduces to <100ms
- **Impact:** MEDIUM - affects manager workflows

**Query 3: Historical Trend Analysis**
- **Execution Time:** 2.2s
- **Frequency:** 12 times/day (Board reports)
- **Issue:** Aggregating 6 months of data (1.2M records) without partitioning
- **Fix:** Implement monthly table partitioning + summary tables - reduces to <300ms
- **Impact:** LOW - infrequent but visible to executives

**💾 Storage & Capacity:**
- **Current Size:** 84 GB (34% of 250 GB provisioned)
- **Growth Rate:** 2.1 GB/week (109 GB/year)
- **Projection:** Will reach 193 GB by Dec 2026 (77% capacity)
- **Status:** ✅ Healthy - no immediate action required
- **Long-term:** Plan capacity expansion by Q4 2026

**🔄 Backup & Replication:**
- **Last Backup:** 4 hours ago (✅ successful)
- **Schedule:** Daily at 2 AM EST (off-peak)
- **Retention:** 30 days (automated cleanup)
- **Replication Lag:** 18ms primary→replica (✅ excellent - target <100ms)
- **Recovery Point Objective (RPO):** <1 hour (continuous replication)
- **Recovery Time Objective (RTO):** <15 minutes (automated failover)

**🔧 Optimization Recommendations:**

**Immediate (Next 24 hours):**
1. **Add Composite Index** on tickets table: (customer_id, created_at, status)
   - Fixes Query 1, reduces exec time from 2.4s → 180ms
   - Impact: 87 queries/day, saves ~3.2 minutes/day

2. **Increase Connection Pool** from 100 → 150
   - Prevents bottlenecks during peak hours
   - Cost: +$45/month, prevents $500/month in performance degradation

**Short-term (Next 7 days):**
3. **Implement Materialized View** for agent performance metrics
   - Fixes Query 2, reduces exec time from 3.1s → 85ms
   - Refresh: Hourly (off-peak: every 15 min)
   - Impact: 42 queries/day, saves ~2.1 minutes/day

4. **Set up Query Performance Monitoring**
   - Automated slow query detection (>1s threshold)
   - Weekly performance reports for DBA team
   - Proactive optimization before user impact

**Medium-term (Next 30 days):**
5. **Implement Table Partitioning** for historical data
   - Monthly partitions for tickets, metrics, audit_logs tables
   - Fixes Query 3, reduces exec time from 2.2s → 280ms
   - Enables faster data archival and purging

6. **Connection Pooling Optimization**
   - Reduce idle timeout from 30s → 15s
   - Implement connection reuse strategy
   - Expected: Reduce peak usage from 87 → 72 connections

**Expected Improvements:**
- **Query Response Time:** 142ms → 98ms average (-31%)
- **Slow Queries:** 3 → 0 (all optimized below 1s threshold)
- **Connection Utilization:** 87% → 72% (safe buffer for growth)
- **Cost:** +$45/month infrastructure, -$200/month in performance issues
- **User Experience:** Faster dashboard loads, improved executive satisfaction

**Database Health Score: 8.5/10** (Excellent with minor optimizations needed)`;
  }

  // Check what the user is asking for
  if (messageLower.includes('follow up') || messageLower.includes('webinar') || messageLower.includes('support')) {
    return `Perfect! I've completed the follow-up workflow. Here's a summary of what I accomplished:

EXECUTION_RESULT:
{
  "title": "Webinar Lead Follow-up Completed",
  "integrations": ["Zoho CRM", "Zoho Desk", "Google Calendar", "Slack"],
  "steps": [
    {
      "number": 1,
      "title": "Found Webinar Leads from CRM",
      "items": [
        {"text": "Sarah Johnson", "email": "sarah.johnson@techcorp.com", "metadata": "TechCorp Solutions - Account Manager: Mike Chen"},
        {"text": "David Martinez", "email": "david.m@innovatestart.io", "metadata": "InnovateStart - Account Manager: Emma Wilson"},
        {"text": "Lisa Chen", "email": "l.chen@bizgrowth.com", "metadata": "BizGrowth Inc - Account Manager: Mike Chen"}
      ]
    },
    {
      "number": 2,
      "title": "Checked Support Status in Zoho Desk",
      "items": [
        {"text": "Sarah Johnson: Has support contact record (responded to support)", "status": "success"},
        {"text": "David Martinez: No support contact record (hasn't responded)", "status": "error"},
        {"text": "Lisa Chen: No support contact record (hasn't responded)", "status": "error"}
      ]
    },
    {
      "number": 3,
      "title": "Scheduled Follow-up Meetings",
      "items": [
        {"text": "2:30 PM IST Tomorrow - David Martinez (InnovateStart)", "status": "info"},
        {"text": "3:00 PM IST Tomorrow - Lisa Chen (BizGrowth Inc)", "status": "info"}
      ]
    },
    {
      "number": 4,
      "title": "Notified Account Managers",
      "items": [
        {"text": "Sent Slack message to Mike Chen with meeting details", "status": "success"},
        {"text": "Sent Slack message to Emma Wilson with meeting details", "status": "success"}
      ]
    }
  ]
}`;
  }

  if (messageLower.includes('schedule') || messageLower.includes('meeting')) {
    return `Great! I've scheduled meetings with the contacts from the recent webinar. Here's what I did:

EXECUTION_RESULT:
{
  "title": "Webinar Meetings Scheduled",
  "integrations": ["Zoho CRM", "Google Calendar", "Slack"],
  "steps": [
    {
      "number": 1,
      "title": "Retrieved Webinar Attendees from CRM",
      "items": [
        {"text": "Sarah Johnson - TechCorp Solutions", "email": "sarah.johnson@techcorp.com"},
        {"text": "David Martinez - InnovateStart", "email": "david.m@innovatestart.io"},
        {"text": "Lisa Chen - BizGrowth Inc", "email": "l.chen@bizgrowth.com"}
      ]
    },
    {
      "number": 2,
      "title": "Created Calendar Events",
      "items": [
        {"text": "10:00 AM IST Monday - Sarah Johnson (30 min)", "status": "info"},
        {"text": "2:30 PM IST Monday - David Martinez (30 min)", "status": "info"},
        {"text": "4:00 PM IST Monday - Lisa Chen (30 min)", "status": "info"}
      ]
    },
    {
      "number": 3,
      "title": "Sent Meeting Invitations",
      "items": [
        {"text": "Email invitations sent to all attendees", "status": "success"},
        {"text": "Calendar notifications enabled", "status": "success"}
      ]
    }
  ]
}`;
  }

  if (messageLower.includes('check') || messageLower.includes('status') || messageLower.includes('leads')) {
    return `I've checked the support status for all leads in the CRM. Here are the results:

EXECUTION_RESULT:
{
  "title": "CRM Lead Support Status Check",
  "integrations": ["Zoho CRM", "Zoho Desk"],
  "steps": [
    {
      "number": 1,
      "title": "Retrieved All Active Leads",
      "items": [
        {"text": "Found 8 active leads in pipeline"},
        {"text": "5 from recent webinar, 3 from cold outreach"}
      ]
    },
    {
      "number": 2,
      "title": "Support Ticket Status",
      "items": [
        {"text": "Sarah Johnson: Ticket #1234 - Resolved", "status": "success"},
        {"text": "David Martinez: No support tickets", "status": "info"},
        {"text": "Lisa Chen: Ticket #1235 - Open (awaiting response)", "status": "error"},
        {"text": "John Smith: Ticket #1236 - Resolved", "status": "success"},
        {"text": "Emily Davis: No support tickets", "status": "info"}
      ]
    },
    {
      "number": 3,
      "title": "Action Required",
      "items": [
        {"text": "1 ticket needs follow-up (Lisa Chen)", "status": "error"},
        {"text": "2 leads have no support interaction yet", "status": "info"}
      ]
    }
  ]
}`;
  }

  if (messageLower.includes('slack') || messageLower.includes('summary') || messageLower.includes('account manager')) {
    return `I've sent a comprehensive summary to the account manager via Slack. Here's what was included:

EXECUTION_RESULT:
{
  "title": "Summary Sent to Account Manager",
  "integrations": ["Zoho CRM", "Zoho Desk", "Slack"],
  "steps": [
    {
      "number": 1,
      "title": "Compiled Lead Activity Summary",
      "items": [
        {"text": "8 active leads analyzed"},
        {"text": "3 meetings scheduled this week"},
        {"text": "2 support tickets requiring attention"}
      ]
    },
    {
      "number": 2,
      "title": "Generated Performance Metrics",
      "items": [
        {"text": "Response rate: 75% (6/8 leads engaged)", "status": "success"},
        {"text": "Average ticket resolution: 24 hours", "status": "success"},
        {"text": "Meeting attendance rate: 90%", "status": "success"}
      ]
    },
    {
      "number": 3,
      "title": "Sent Slack Message",
      "items": [
        {"text": "Message sent to #sales channel", "status": "success"},
        {"text": "Account manager Mike Chen notified", "status": "success"},
        {"text": "Included action items and next steps", "status": "success"}
      ]
    }
  ]
}`;
  }

  // Default response for any other query
  return `I've processed your request successfully! Here's what I did:

EXECUTION_RESULT:
{
  "title": "Task Completed Successfully",
  "integrations": ["Zoho CRM", "Zoho Desk", "Slack"],
  "steps": [
    {
      "number": 1,
      "title": "Analyzed Your Request",
      "items": [
        {"text": "Understood the task requirements"},
        {"text": "Identified relevant data sources"}
      ]
    },
    {
      "number": 2,
      "title": "Executed Actions",
      "items": [
        {"text": "Connected to necessary services", "status": "success"},
        {"text": "Retrieved and processed data", "status": "success"},
        {"text": "Applied business logic", "status": "success"}
      ]
    },
    {
      "number": 3,
      "title": "Results",
      "items": [
        {"text": "Task completed successfully", "status": "success"},
        {"text": "All systems updated", "status": "success"}
      ]
    }
  ]
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response('Invalid message', { status: 400 });
    }

    // Create a streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Phase 1: Send "analyzing" thinking state
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'thinking',
                state: 'analyzing',
                text: 'Analyzing your question and understanding what you need...',
              })}\n\n`
            )
          );
          await new Promise(resolve => setTimeout(resolve, 800));

          // Phase 2: Send "processing" thinking state
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'thinking',
                state: 'processing',
                text: 'Processing your request and gathering relevant information...',
              })}\n\n`
            )
          );
          await new Promise(resolve => setTimeout(resolve, 1200));

          // Phase 3: Send "synthesizing" thinking state
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'thinking',
                state: 'synthesizing',
                text: 'Synthesizing the response and preparing the answer...',
              })}\n\n`
            )
          );
          await new Promise(resolve => setTimeout(resolve, 800));

          // DEMO MODE: Return streaming mock response with typewriter effect
          if (DEMO_MODE) {
            const demoResponse = getDemoResponse(message);

            // Check if response contains special markers (DASHBOARD_DATA or EXECUTION_RESULT)
            const hasDashboard = demoResponse.includes('DASHBOARD_DATA:');
            const hasExecution = demoResponse.includes('EXECUTION_RESULT:');

            if (hasDashboard || hasExecution) {
              // Split response: stream text before marker, send JSON as final chunk
              const marker = hasDashboard ? 'DASHBOARD_DATA:' : 'EXECUTION_RESULT:';
              const markerIndex = demoResponse.indexOf(marker);
              const textBeforeMarker = demoResponse.substring(0, markerIndex);
              // markerAndAfter extracted but not used in streaming - data sent separately

              // Stream ONLY the text before the marker with typewriter effect
              const CHARS_PER_CHUNK = 3;
              const DELAY_MS = 25;

              for (let i = 0; i < textBeforeMarker.length; i += CHARS_PER_CHUNK) {
                const chunk = textBeforeMarker.slice(0, i + CHARS_PER_CHUNK);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`
                  )
                );
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
              }

              // Send the marker + JSON + trailing text as ONE final chunk (no typewriter)
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'text', content: demoResponse })}\n\n`
                )
              );
            } else {
              // Regular streaming for responses without special markers
              const CHARS_PER_CHUNK = 3;
              const DELAY_MS = 25;

              for (let i = 0; i < demoResponse.length; i += CHARS_PER_CHUNK) {
                const chunk = demoResponse.slice(0, i + CHARS_PER_CHUNK);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`
                  )
                );

                if (i + CHARS_PER_CHUNK < demoResponse.length) {
                  await new Promise(resolve => setTimeout(resolve, DELAY_MS));
                }
              }
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }
          // System prompt that guides Claude's behavior
          const systemPrompt = `You are an AI assistant integrated with multiple business tools (Zoho CRM, Zoho Desk, Slack, Google Calendar).

When a user asks you to perform tasks:
1. Use the available tools to execute the tasks step by step
2. After using tools, provide a clear summary of what was accomplished
3. Format your final response to show structured execution results

After you've called all necessary tools, provide a summary in this EXACT format:

EXECUTION_RESULT:
{
  "title": "Brief title of what was accomplished",
  "integrations": ["List", "of", "services", "used"],
  "steps": [
    {
      "number": 1,
      "title": "Step description",
      "items": [
        {"text": "Item description", "status": "success", "email": "optional@email.com", "metadata": "optional metadata"}
      ]
    }
  ]
}

Status values: "success" (✅), "error" (❌), "info" (ℹ️), or omit for bullet point.

Example:
If you search CRM for 3 leads, check their support status, and find 2 need follow-up, format like:
EXECUTION_RESULT:
{
  "title": "Webinar Lead Follow-up Completed",
  "integrations": ["Zoho CRM", "Zoho Desk", "Google Calendar", "Slack"],
  "steps": [
    {
      "number": 1,
      "title": "Found Webinar Leads from CRM",
      "items": [
        {"text": "Sarah Johnson", "email": "sarah@example.com", "metadata": "TechCorp - Account Manager: Mike"}
      ]
    },
    {
      "number": 2,
      "title": "Checked Support Status",
      "items": [
        {"text": "Sarah Johnson: Responded to support", "status": "success"},
        {"text": "David Martinez: No response", "status": "error"}
      ]
    }
  ]
}`;

          const conversationMessages: Anthropic.MessageParam[] = [
            {
              role: 'user',
              content: message,
            },
          ];

          let continueLoop = true;
          let finalTextResponse = '';

          while (continueLoop) {
            // Call Claude API
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 4096,
              temperature: 0.7,
              system: systemPrompt,
              messages: conversationMessages,
              tools,
            });

            // Check if Claude wants to use tools
            if (response.stop_reason === 'tool_use') {
              const toolUses: Anthropic.ToolUseBlock[] = response.content.filter(
                (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
              );

              // Execute all tools
              const toolResults: Anthropic.ToolResultBlockParam[] = [];

              for (const toolUse of toolUses) {
                // Stream tool execution notification
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'tool_use',
                      tool: toolUse.name,
                      input: toolUse.input,
                    })}\n\n`
                  )
                );

                const result = executeTool(toolUse.name, toolUse.input as Record<string, unknown>);

                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: toolUse.id,
                  content: JSON.stringify(result),
                });
              }

              // Add assistant's response and tool results to conversation
              conversationMessages.push({
                role: 'assistant',
                content: response.content,
              });

              conversationMessages.push({
                role: 'user',
                content: toolResults,
              });

              // Continue loop to get final response after tool use
            } else {
              // No more tool use, stream final response
              for (const block of response.content) {
                if (block.type === 'text') {
                  finalTextResponse += block.text;
                }
              }

              // Stream the text response
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'text', content: finalTextResponse })}\n\n`
                )
              );

              continueLoop = false;
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                content: 'An error occurred: ' + (error instanceof Error ? error.message : 'Unknown error'),
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('API error:', error);
    return new Response('Internal server error: ' + (error instanceof Error ? error.message : 'Unknown'), {
      status: 500,
    });
  }
}
