# AI Marketing Studio — Revised Development Blueprint

> Source: "Revised Development Blueprint & Implementation Requirements" supplied by the owner. Content unchanged; converted to Markdown for Claude Code.


**Product Direction:** Complete AI Marketing Operations Platform  
**Target Customers:** Small Businesses, Individual Entrepreneurs, Marketing Agencies and Freelancers  
**Development Approach:** Modular, scalable, multi-tenant SaaS platform  
**Primary Objective:** Automate the complete marketing lifecycle through AI, workflow automation and platform integrations.  


## 1. Project Overview

The AI Marketing Platform will be a unified workspace that helps businesses and marketing agencies manage their complete digital marketing operations from a single platform.

Users should be able to enter their business details, upload product images, provide website URLs or import product information. The platform will analyse their business, products, services, target audience and market positioning, then generate marketing strategies, campaigns, social media content, creatives, advertisements, SEO content and other marketing assets.

Beyond content generation, the platform will manage social media calendars, schedule and publish approved content, monitor engagement, organise enquiries, assist with customer responses and analyse marketing performance.

The platform should eliminate repetitive manual marketing work and reduce dependency on multiple disconnected marketing tools and subscriptions.

The long-term objective is to create an AI-powered marketing operations system where users can automate complete workflows rather than perform individual marketing tasks manually.

## 2. Vision and Objectives

#### Vision

To build an intelligent marketing workspace that allows businesses and agencies to manage, automate and optimise their digital marketing activities with minimal manual effort.

#### Primary Objectives

1. Centralise marketing operations within one platform.
2. Use AI to understand businesses, products, services and target audiences.
3. Generate marketing strategies and campaigns automatically.
4. Create platform-specific text, images, videos and marketing creatives.
5. Provide an editable creative design workspace.
6. Manage multiple social media accounts from one dashboard.
7. Schedule, publish and manage content across supported platforms.
8. Automate repetitive marketing workflows.
9. Manage comments, messages and customer enquiries through a unified workspace where integrations permit.
10. Provide marketing analytics, campaign reports and actionable recommendations.
11. Support multiple businesses, brands, clients and team members.
12. Reduce the time, cost and effort required to execute marketing activities.

## 3. Target Customers and User Types

The platform must support two primary customer segments.

### A. Small Businesses and Individual Entrepreneurs

Examples:

* Retail shops and local businesses.
* Restaurants and food businesses.
* Manufacturers and distributors.
* E-commerce and D2C brands.
* Educational institutions.
* Real estate businesses.
* Professional service providers.
* Startups and individual entrepreneurs.

Required experience:

* Simple onboarding.
* AI-assisted business setup.
* Easy product and service management.
* Ready-to-use marketing campaigns.
* Simple creative editing.
* Social media scheduling.
* Automated marketing suggestions.
* Affordable subscription plans.

A business owner should be able to manage most marketing activities without needing a dedicated marketing team.

### B. Marketing Agencies and Freelancers

Agencies must be able to manage multiple clients and brands through one account.

Required experience:

* Multiple client workspaces.
* Separate brand profiles and assets.
* Team and employee management.
* Role-based permissions.
* Client-specific marketing calendars.
* Client approval workflows.
* Campaign management.
* Bulk content generation.
* White-label reporting as a future capability.
* Usage and credit tracking by client.
* Consolidated agency dashboard.

An agency should be able to manage multiple clients without mixing their content, data, permissions or marketing accounts.

## 4. Platform Architecture and Core Modules

The application should be developed as a modular SaaS platform.

### Module 1: Authentication and Workspace Management

Features:

* Registration and login.
* Email verification.
* Password reset.
* Secure session management.
* Organisation/workspace creation.
* Multiple workspace support.
* User invitations.
* Role-based access control.
* Team member management.
* Subscription and usage limits.

Suggested roles:

* Platform Super Admin.
* Organisation Owner.
* Organisation Admin.
* Marketing Manager.
* Content Creator.
* Designer.
* Approver.
* Client Viewer.

Permissions must be configurable and enforced by the backend.

### Module 2: Business and Brand Management

Users should be able to create and manage one or more brands.

Information:

* Business name.
* Industry and business category.
* Business description.
* Website URL.
* Business location.
* Contact information.
* Target markets.
* Target audience.
* Brand logo.
* Brand colours.
* Brand fonts.
* Tone of voice.
* Brand guidelines.
* Preferred languages.
* Competitor information.

AI should use the stored brand information as context for all subsequent content generation.

Users must be able to update and override AI-generated business information.

### Module 3: Product and Service Management

Users should be able to add products and services manually, through bulk import or supported integrations.

Features:

* Product/service name.
* Description.
* Product category.
* Pricing.
* Features and specifications.
* Benefits.
* Product images.
* Product videos.
* Website or purchase URL.
* Target audience.
* Product availability.
* Unique selling points.

Bulk import should support CSV and Excel where practical, with validation and downloadable error reports.

AI should analyse uploaded information and generate:

* Product summaries.
* Key selling points.
* Customer benefits.
* Target audience.
* Marketing angles.
* Suggested campaigns.
* Frequently asked questions.
* Content ideas.

AI must not invent product specifications, prices, certifications, guarantees or other factual claims.

### Module 4: AI Marketing Intelligence

This module is the intelligence layer of the platform.

It should analyse:

* Business profile.
* Products and services.
* Brand positioning.
* Target customers.
* Customer pain points.
* Competitor information supplied or obtained through permitted sources.
* Marketing objectives.
* Selected platforms.
* Previous campaign performance.

Expected outputs:

* Marketing strategy.
* Customer personas.
* Brand positioning.
* Content pillars.
* Campaign concepts.
* Promotional ideas.
* Seasonal marketing suggestions.
* Platform recommendations.
* Marketing calendar suggestions.
* Campaign objectives and KPIs.

Users must be able to regenerate, edit, save and approve AI recommendations.

AI outputs should include their assumptions and identify information that requires user confirmation.

### Module 5: AI Content Studio

Generate platform-specific marketing content.

Supported content:

* Social media captions.
* Posts.
* Reels scripts.
* Video scripts.
* Stories.
* Product descriptions.
* Promotional content.
* Blog articles.
* Website landing-page content.
* Email campaigns.
* WhatsApp marketing messages.
* LinkedIn content.
* Advertising copy.
* SEO titles and meta descriptions.
* Hashtags and keywords.

Generation controls:

* Brand.
* Product or service.
* Marketing objective.
* Target audience.
* Platform.
* Language.
* Tone.
* Content format.
* Campaign.
* Call to action.

Users should be able to generate multiple variations, edit content, save drafts and send content for approval.

### Module 6: AI Creative Studio

Provide an integrated creative workspace for creating marketing visuals.

Features:

* AI image generation.
* Product-based creative generation.
* Social media templates.
* Promotional banners.
* Advertisements.
* Product posters.
* Stories and carousel designs.
* Platform-specific dimensions.
* Background removal where supported.
* Image resizing.
* Text and typography editing.
* Brand logo placement.
* Brand colour application.
* Layer management.
* Template library.
* Save and duplicate designs.
* Export in supported image formats.

Use an editable design engine such as Fabric.js or an equivalent suitable editor.

Generated designs must remain editable wherever possible. Do not treat flattened AI-generated images as editable source designs.

Users must be able to save designs as reusable brand templates.

### Module 7: AI Video and Short-Form Content Studio

Create a modular video capability.

Features:

* Reels and short-video scripts.
* Storyboards.
* Scene suggestions.
* Product video concepts.
* Voiceover scripts.
* Captions and subtitles.
* Image-to-video generation through supported providers.
* Video templates.
* Basic trimming and editing where feasible.
* Platform-specific export settings.

Advanced AI video generation should be integrated through replaceable providers and introduced in a later development phase if cost or provider limitations make it unsuitable for the initial release.

### Module 8: Marketing Campaign Manager

Users should be able to create and manage campaigns.

Campaign details:

* Campaign name.
* Brand.
* Product/service.
* Objective.
* Target audience.
* Platforms.
* Start and end dates.
* Budget, if applicable.
* Campaign strategy.
* Content assets.
* Assigned team members.
* Approval status.
* Performance indicators.

Campaign types:

* Product launch.
* Seasonal promotion.
* Festival campaigns.
* Lead generation.
* Brand awareness.
* Sales promotion.
* Event promotion.
* Retargeting campaigns.

Each campaign should connect its content, creatives, publishing jobs and analytics.

### Module 9: Unified Social Media Management

Provide one workspace for managing supported social media accounts.

Initial integration targets:

* Facebook Pages.
* Instagram professional accounts.
* LinkedIn Pages and profiles where permitted.
* Pinterest.
* YouTube.
* Other platforms through future integrations.

Features:

* Connect social accounts through official OAuth flows.
* Display connected accounts.
* Manage account permissions.
* Create platform-specific posts.
* Preview posts.
* Manage drafts.
* Schedule posts.
* Publish immediately.
* View publishing status.
* Reschedule and cancel pending posts.
* Retry failed publishing jobs safely.
* Maintain publishing history.
* Display integration errors.

Platform-specific limitations must be clearly communicated. Do not promise that every content type or action is supported by every platform API.

The integration layer must use official APIs and comply with platform policies, permissions and review requirements.

### Module 10: Unified Marketing Calendar

Provide calendar views for managing all marketing activities.

Views:

* Daily.
* Weekly.
* Monthly.
* Campaign-based.
* Brand-based.
* Platform-based.

Features:

* Drag-and-drop scheduling.
* Draft and scheduled content.
* Published content.
* Failed publishing jobs.
* Approval-pending content.
* Bulk scheduling.
* Recurring content schedules.
* Rescheduling.
* Content filtering.
* Team assignment.
* Calendar notifications.

Users should be able to select a calendar item and view or edit its associated content, creative, campaign and publishing status.

### Module 11: Workflow Automation Builder

This is one of the most important differentiating modules.

The platform must allow users to create automation workflows without writing code.

Provide a visual workflow builder using triggers, conditions and actions.

#### Example triggers

* New product added.
* New campaign created.
* New content generated.
* Content approved.
* Scheduled publishing time reached.
* New comment received, where supported.
* New customer enquiry received.
* Campaign performance reaches a threshold.
* Scheduled recurring event.

#### Example conditions

* Brand equals selected brand.
* Platform equals Instagram.
* Campaign objective equals lead generation.
* Content approval status is approved.
* Product category matches a condition.
* Engagement exceeds a configured threshold.

#### Example actions

* Generate marketing content.
* Generate creative assets.
* Create campaign.
* Request client approval.
* Notify a team member.
* Schedule a post.
* Publish approved content.
* Create an enquiry or lead.
* Generate a report.
* Send a supported notification.
* Trigger another workflow.

#### Example complete automation

When a new product is added:

1. Analyse product information.
2. Generate product positioning.
3. Identify the target audience.
4. Generate a marketing strategy.
5. Create social media content.
6. Generate marketing creatives.
7. Send content for approval.
8. After approval, schedule selected posts.
9. Publish at the configured time.
10. Track performance.
11. Generate a performance summary.

Users must be able to configure, activate, pause, duplicate and monitor workflows.

Provide execution logs, error details, retry controls and workflow version history.

Include safeguards against infinite loops, duplicate execution and accidental publishing.

### Module 12: Client Collaboration and Approval Management

This module is essential for agencies.

Features:

* Invite clients to their workspace.
* Assign client-specific permissions.
* Share campaigns and content.
* Client approval dashboard.
* Approve or reject content.
* Add comments and revision requests.
* Track approval history.
* Notify relevant team members.
* Maintain version history.
* Display pending approvals.

No content requiring approval should be published before the required approval is recorded.

Support configurable approval rules for individual businesses and agencies.

### Module 13: Unified Engagement Inbox

Provide a central workspace for supported customer interactions.

Potential integrations:

* Facebook comments and messages.
* Instagram comments and messages.
* Other supported social interactions.
* WhatsApp Business messaging through approved APIs.
* Website enquiry forms.
* Connected CRM or lead sources.

Features:

* Centralised conversations where supported.
* Enquiry categorisation.
* AI-generated reply suggestions.
* Conversation summaries.
* Lead identification.
* Priority classification.
* Assignment to team members.
* Internal notes.
* Follow-up reminders.
* Conversation status.
* Response history.

AI should suggest responses, but automatic sending must be separately configured and restricted by explicit user permissions.

The platform must not imply that every platform provides unrestricted access to private messages, comments or historical conversations.

### Module 14: Lead and Enquiry Management

Capture and organise leads from supported sources.

Features:

* Website enquiry integration.
* Social lead integrations where permitted.
* Manual lead entry.
* Contact information.
* Lead source.
* Interested product/service.
* Assigned employee.
* Lead status.
* Follow-up date.
* Notes.
* Activity history.
* Export and reporting.

Suggested lead stages:

* New.
* Contacted.
* Qualified.
* Proposal Sent.
* Converted.
* Lost.

Future versions may include a lightweight CRM or integrations with existing CRM platforms.

### Module 15: Marketing Analytics and Reporting

Provide a unified marketing performance dashboard.

Metrics should be displayed only when the relevant integration provides reliable data.

Potential metrics:

* Posts published.
* Reach.
* Impressions.
* Engagement.
* Likes and comments.
* Shares.
* Clicks.
* Video views.
* Follower growth.
* Website visits.
* Leads generated.
* Conversions.
* Campaign spend.
* Cost per lead.
* Return on ad spend where data is available.

Features:

* Campaign performance.
* Platform comparison.
* Brand-level reports.
* Client-level reports.
* Date filters.
* Performance trends.
* Content comparison.
* Exportable reports.
* Scheduled reports.
* AI-generated performance summaries.
* Recommendations for future campaigns.

Clearly distinguish estimated, imported and platform-reported metrics.

### Module 16: SEO and Website Marketing

Provide SEO support for businesses and agencies.

Features:

* Keyword research integrations.
* Keyword grouping.
* Search intent analysis.
* SEO content generation.
* Blog generation.
* Meta titles and descriptions.
* Content optimisation suggestions.
* Internal linking recommendations.
* Landing-page content.
* Website audit integrations.
* Search performance reporting through supported integrations.

Google Search Console and other approved integrations should be used where available.

Do not present AI-generated keyword suggestions as verified search-volume or ranking data unless supported by a data provider.

### Module 17: Integrations and Connected Services

Build an integration management centre.

Potential integrations:

* Meta.
* LinkedIn.
* Pinterest.
* YouTube.
* WhatsApp Business.
* Google Business Profile.
* Google Ads.
* Google Analytics.
* Google Search Console.
* Email services.
* Cloud storage.
* Website platforms.
* CRM platforms.
* Payment gateways.
* AI model providers.

Each integration should have:

* Connection status.
* OAuth or API configuration.
* Permission information.
* Last sync time.
* Error status.
* Disconnect option.
* Reconnection flow.

Integrations must be modular so that providers can be added, replaced or disabled without rewriting the core application.

### Module 18: Subscription, Billing and Usage Management

Implement SaaS billing.

Features:

* Free trial where applicable.
* Subscription plans.
* Monthly and annual billing.
* Feature restrictions.
* AI credits.
* Usage tracking.
* Storage limits.
* Connected account limits.
* Team member limits.
* Client workspace limits.
* Payment history.
* Invoices.
* Upgrade and downgrade.
* Subscription cancellation.

Potential payment gateway: Razorpay for the Indian market, with an architecture that permits additional providers.

AI credit consumption must be recorded accurately and transactionally.

### Module 19: Platform Administration

Create a separate super-admin dashboard.

Features:

* User management.
* Organisation management.
* Subscription management.
* Usage monitoring.
* AI provider configuration.
* Model configuration.
* Credit management.
* Integration health.
* Job monitoring.
* Workflow monitoring.
* Failed job management.
* Customer support.
* Audit logs.
* Feature flags.
* System configuration.
* Platform analytics.

Administrative access must be separate from customer workspace permissions.

## 5. Core User Journeys

### Journey A: Small Business Owner

1. Register and create a workspace.
2. Enter business information.
3. Create a brand profile.
4. Add products and services.
5. Connect social media accounts.
6. Ask AI to analyse the business.
7. Generate a marketing strategy.
8. Generate content and creatives.
9. Edit and approve content.
10. Schedule posts.
11. Monitor publishing status.
12. Review performance and AI recommendations.

### Journey B: Marketing Agency

1. Register an agency workspace.
2. Create multiple client workspaces.
3. Invite team members.
4. Configure each client’s brand.
5. Add client products and services.
6. Generate campaigns and content in bulk.
7. Assign work to team members.
8. Send content to clients for approval.
9. Schedule approved content.
10. Manage supported customer interactions.
11. Review client-level analytics.
12. Generate client reports.

### Journey C: Automated Product Marketing

1. A user adds a product.
2. The system detects the configured trigger.
3. AI analyses the product.
4. The workflow generates a campaign.
5. Content and creatives are generated.
6. Approval is requested.
7. Approved content enters the calendar.
8. Publishing jobs execute at the configured time.
9. Results are collected through connected integrations.
10. AI prepares a performance summary.

## 6. Technology Stack

Use a maintainable, production-ready technology stack.

| Layer | Recommended technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| UI | Tailwind CSS and reusable component system |
| Backend | Node.js with NestJS |
| API | REST APIs initially; webhooks where required |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |
| Background jobs | BullMQ |
| AI integration | OpenAI behind a provider abstraction |
| Creative editor | Fabric.js or equivalent |
| File storage | AWS S3 or Cloudflare R2 |
| Authentication | Secure session or token-based authentication |
| Payments | Razorpay initially |
| Deployment | AWS or suitable cloud infrastructure |
| Containers | Docker |
| CI/CD | GitHub Actions |
| Monitoring | Structured logs, metrics and error tracking |

> **Superseded (5 Nov 2026):** Database is MongoDB (Atlas) and the data library is Mongoose, not PostgreSQL/Prisma. See `docs/decisions.md` D-001 and D-002.


Use a provider abstraction for AI, image generation, video generation and other external services. The application must not be tightly coupled to a single AI provider.

## 7. High-Level System Architecture

Build the application using modular backend services within a maintainable architecture. Do not introduce unnecessary microservices at the beginning.

Core layers:

1. Presentation Layer – Web application and dashboards.
2. API Layer – Authentication, validation and business APIs.
3. Business Logic Layer – Marketing, campaign, content and workflow services.
4. AI Intelligence Layer – Analysis, generation and recommendations.
5. Workflow Engine – Triggers, conditions, actions and execution.
6. Integration Layer – Social platforms and third-party services.
7. Background Processing Layer – Queued jobs and scheduled tasks.
8. Data Layer – PostgreSQL, Redis and object storage.
9. Monitoring Layer – Logs, metrics, audit trails and alerts.

All business data must be isolated by organisation and workspace.

## 8. Suggested Database Entities

Design the database with appropriate relationships, indexes, constraints and tenant isolation.

Core entities:

* User
* Organisation
* Workspace
* Membership
* Role
* Permission
* Brand
* BrandGuideline
* Product
* ProductImage
* Service
* Campaign
* CampaignObjective
* MarketingStrategy
* AudiencePersona
* ContentAsset
* ContentVersion
* Design
* DesignTemplate
* MediaAsset
* SocialAccount
* SocialPermission
* SocialPost
* PublishingJob
* PublishingLog
* MarketingCalendar
* Approval
* ApprovalComment
* Workflow
* WorkflowVersion
* WorkflowTrigger
* WorkflowCondition
* WorkflowAction
* WorkflowExecution
* WorkflowExecutionLog
* Conversation
* Message
* Lead
* LeadActivity
* AnalyticsSnapshot
* Report
* Integration
* AIJob
* AIProvider
* Subscription
* Plan
* CreditTransaction
* Invoice
* Notification
* AuditLog
* SupportTicket

Use organisation_id/workspace_id consistently where required. Define which records are global, organisation-scoped or client-workspace-scoped.

## 9. AI Engineering Requirements

AI functionality must be reliable, measurable and maintainable.

Requirements:

* Use structured outputs and schema validation.
* Maintain versioned prompts.
* Store relevant AI job metadata.
* Track model, provider, token usage and cost.
* Support timeouts and retries.
* Handle provider failures gracefully.
* Provide generation history.
* Allow user editing and feedback.
* Use brand context when generating content.
* Prevent unsupported factual claims.
* Apply content moderation and platform-specific validation.
* Support configurable model selection.
* Use asynchronous processing for long-running jobs.
* Prevent duplicate charges on retried jobs.

AI should assist users, not silently make irreversible decisions.

Publishing, spending advertising budgets and sending external customer messages must follow explicit permissions and approval rules.

## 10. Security and Reliability Requirements

Implement production-grade security from the beginning.

Mandatory requirements:

* Secure authentication.
* Role-based access control.
* Organisation and workspace isolation.
* Server-side permission enforcement.
* Input validation.
* Rate limiting.
* Secure password storage.
* Encrypted OAuth tokens and secrets.
* Signed URLs for private media.
* Secure file upload validation.
* Audit logging.
* Protection against common web vulnerabilities.
* CSRF protection where applicable.
* Secure webhook validation.
* Database backups.
* Restore testing.
* Monitoring and alerting.
* Secrets management.
* Data retention policies.
* Privacy and account deletion workflows.

Never expose API keys, social access tokens, private media or sensitive customer information to the browser unnecessarily.

## 11. Background Jobs and Workflow Reliability

Long-running tasks must execute asynchronously.

Examples:

* AI content generation.
* Image generation.
* Video processing.
* Bulk product imports.
* Bulk content creation.
* Social publishing.
* Analytics synchronisation.
* Scheduled reports.
* Workflow execution.

Each job should maintain:

* Job ID.
* Organisation/workspace.
* Job type.
* Status.
* Start and completion timestamps.
* Retry count.
* Error details.
* Related entity.
* Usage or credit transaction reference.

Use idempotency keys for operations that must not execute twice.

Provide clear job states such as Pending, Processing, Completed, Failed, Cancelled and Retry Scheduled.

## 12. UX and Interface Requirements

The platform should feel like a professional SaaS product, not a collection of disconnected AI tools.

Design principles:

* Clean and modern interface.
* Simple navigation.
* Responsive design.
* Desktop, tablet and mobile support.
* Consistent design system.
* Clear visual hierarchy.
* Accessible forms and controls.
* Fast-loading dashboards.
* Useful empty states.
* Clear loading and error states.
* Contextual AI assistance.
* Minimal unnecessary steps.

Suggested primary navigation:

1. Overview
2. AI Marketing
3. Content Studio
4. Creative Studio
5. Campaigns
6. Calendar
7. Social Accounts
8. Inbox
9. Leads
10. Automations
11. Analytics
12. Brand & Products
13. Team & Clients
14. Integrations
15. Billing
16. Settings

Navigation and access should adapt to the user’s role and subscription.

## 13. Development Roadmap

Develop in controlled phases, with working and testable deliverables at every stage.

### Phase 1 – SaaS Foundation

* Authentication.
* Organisations and workspaces.
* Multi-tenant architecture.
* User roles and permissions.
* Brand management.
* Product and service management.
* File uploads.
* Admin foundation.
* Subscription and credit foundation.

Deliverable: A working SaaS foundation with secure organisation separation.

### Phase 2 – AI Marketing Intelligence

* Business analysis.
* Product analysis.
* Audience identification.
* Marketing strategy.
* Campaign recommendations.
* AI job management.
* Prompt versioning.
* AI usage tracking.

Deliverable: AI can analyse a business and produce a structured marketing strategy.

### Phase 3 – Content and Creative Studio

* Social content generation.
* Blog and SEO content.
* Platform-specific copy.
* Image generation.
* Editable creative editor.
* Templates.
* Export and marketing kits.
* Content versioning.

Deliverable: Users can create, edit and export complete marketing assets.

### Phase 4 – Campaigns and Social Integrations

* Campaign manager.
* Social account connections.
* Platform capability checks.
* Content previews.
* Publishing jobs.
* Publishing logs.
* Publishing history.
* Integration error handling.

Deliverable: Users can connect supported accounts and publish approved content where permissions allow.

### Phase 5 – Calendar and Approval Workflows

* Unified calendar.
* Scheduling.
* Bulk scheduling.
* Rescheduling and cancellation.
* Team assignment.
* Client access.
* Approval and revision workflows.
* Notifications.

Deliverable: Businesses and agencies can manage the complete content approval and publishing process.

### Phase 6 – Workflow Automation Engine

* Visual workflow builder.
* Trigger system.
* Condition evaluator.
* Action executor.
* Workflow versions.
* Execution logs.
* Retry handling.
* Scheduled triggers.
* Automation templates.

Deliverable: Users can configure and execute end-to-end marketing automations.

### Phase 7 – Engagement and Lead Management

* Unified inbox foundation.
* Supported message/comment integrations.
* AI reply suggestions.
* Lead capture.
* Lead assignment.
* Follow-up tracking.
* Conversation history.

Deliverable: Users can organise marketing-generated enquiries and supported customer interactions.

### Phase 8 – Analytics and Reporting

* Platform analytics integrations.
* Campaign performance.
* Content performance.
* Lead reporting.
* AI insights.
* Client reports.
* Scheduled reports.

Deliverable: Users can measure marketing performance and make informed decisions.

### Phase 9 – Advanced SaaS Capabilities

* Advanced subscriptions.
* Agency usage management.
* Additional integrations.
* Advanced video capabilities.
* White-label reporting.
* Automation templates marketplace.
* Advanced AI agents.
* Performance optimisation.

Deliverable: A mature, scalable marketing operations platform.

## 14. Testing and Acceptance Requirements

Do not consider a module complete simply because its screens or APIs have been developed.

Every module must have:

* Unit tests.
* API tests.
* Integration tests.
* Permission tests.
* Database tests.
* Failure and recovery tests.
* UI workflow tests.
* Regression tests.

Mandatory end-to-end acceptance scenarios:

1. A business can register and create a workspace.
2. An agency can create multiple isolated client workspaces.
3. Users cannot access another organisation’s data.
4. A user can create and manage a brand.
5. A user can upload and manage products.
6. AI can analyse products using available information.
7. AI can generate a marketing strategy.
8. Users can generate and edit content.
9. Users can create and export editable creatives.
10. Users can create campaigns.
11. Users can connect supported social accounts.
12. Users can schedule approved content.
13. Publishing jobs report accurate results.
14. Failed jobs can be safely retried.
15. Calendar items reflect actual publishing status.
16. Clients can approve or reject content.
17. Approval history is maintained.
18. Workflow triggers execute correctly.
19. Duplicate workflow executions are prevented.
20. Engagement and lead integrations handle permission limitations.
21. Analytics reflect the available source data.
22. AI credit deductions are accurate.
23. Subscription restrictions are enforced.
24. Admins can monitor system activity.
25. Logs provide enough information to diagnose failures.

## 15. Important Implementation Rules for the AI Development Tool

The development tool must follow these rules throughout the project.

1. First inspect the existing repository, files, architecture, database, APIs and completed functionality.
2. Do not blindly replace or recreate existing working components.
3. Prepare an implementation assessment and identify missing features.
4. Maintain the existing functionality unless a change is necessary and approved.
5. Develop frontend and backend together for every module.
6. Do not create UI-only features with dummy data and call them complete.
7. Connect all functional controls to real APIs and database operations.
8. Use mock data only in clearly identified development or demo environments.
9. Implement proper authentication and server-side permissions.
10. Maintain multi-tenant data isolation.
11. Use reusable components and modular services.
12. Use database migrations rather than manually changing production schemas.
13. Implement structured logging and meaningful error handling.
14. Use background queues for long-running operations.
15. Maintain API and database documentation.
16. Never hardcode secrets, API keys or access tokens.
17. Verify external API permissions before implementing integration claims.
18. Clearly distinguish completed, partially supported and unavailable capabilities.
19. Run tests after every significant change.
20. Do not proceed to the next phase until the current phase meets its acceptance criteria.
21. Maintain a development progress report.
22. Document known limitations and outstanding dependencies.
23. Do not deploy to production without explicit approval.
24. Do not mark a feature complete until it has been tested end to end.

## 16. Required Development Documentation

Maintain the following project documents:

* Product Requirements Document.
* System Architecture Document.
* Database Schema and ER Diagram.
* API Documentation.
* Module Specifications.
* UI/UX Design Specifications.
* AI Prompt and Model Configuration Documentation.
* Integration Documentation.
* Security Requirements.
* Test Cases and Acceptance Reports.
* Deployment and Environment Setup.
* Backup and Recovery Procedures.
* Development Progress Tracker.
* Known Issues and Technical Debt Register.

## 17. Final Product Definition

The final product should be a complete AI-powered marketing operations platform that brings together:

* Business and brand intelligence.
* Product and service analysis.
* Marketing strategy.
* AI content generation.
* AI creative and video production.
* Campaign management.
* Social media management.
* Scheduling and publishing.
* Marketing automation.
* Client collaboration.
* Content approvals.
* Customer engagement.
* Lead management.
* SEO support.
* Marketing analytics.
* Reporting.
* Subscription and usage management.

The platform should serve both individual businesses and agencies through a secure, multi-tenant SaaS architecture.

#### Final Product Positioning:

“An AI-powered marketing operations platform that transforms your business information into complete marketing campaigns, creates and manages content, automates workflows, publishes across supported platforms, manages customer engagement and measures performance — all from one intelligent workspace.”

#### Core Product Philosophy:

Do not build a platform that merely generates marketing content. Build a platform that understands what a business needs to market, helps execute the work, automates repetitive processes and continuously helps users improve their marketing operations.
