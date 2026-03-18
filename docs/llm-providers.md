# LLM Provider Support for Ansible Lightspeed

The Ansible VS Code extension supports multiple LLM providers including Red Hat Ansible Lightspeed with watsonx Code Assistant (WCA), Google Gemini, and Red Hat AI for Ansible code generation and assistance.

## Supported Features

When using LLM providers, the following Ansible Lightspeed features are available:

**Supported:**

- Playbook Generation
- Role Generation
- Playbook Explanation
- Role Explanation
- Interactive Chat (if provider supports it)

**Not Supported:**

- Content Source Matching (WCA only)

## Supported Providers

### IBM watsonx (WCA)

The default provider. Uses Red Hat Ansible Lightspeed with IBM watsonx Code Assistant.

**Configuration:**

- Provider: `wca`
- API Endpoint: `https://c.ai.ansible.redhat.com` (default)
- Authentication: OAuth2 (Red Hat SSO)

### Google Gemini

Direct access to Google Gemini models.

**Configuration:**

- Provider: `google`
- API Endpoint: `https://generativelanguage.googleapis.com/v1beta` (fixed; custom URLs only for local testing/proxies)
- API Key: Your Google AI API key (starts with `AIza`)
- Model Name: e.g., `gemini-2.5-flash`, `gemini-1.5-pro`

### Red Hat AI

Supports models hosted on the Red Hat AI platform. This provider communicates using the standard `/v1/chat/completions` API and authenticates with a Bearer token.

**Configuration:**

- Provider: `rhcustom`
- API Endpoint: Base URL of your deployment (required)
- API Key: Your API key for the endpoint (required)
- Model Name: The model to use, e.g., `Granite-3.3-8B-Instruct` (required)
- Max Tokens: Maximum tokens per response (optional, defaults to 1600)

> **Note:** The endpoint must expose an OpenAI-compatible `/v1/chat/completions` route. Provide only the base URL (e.g., `https://my-api.example.com`); the extension appends `/v1/chat/completions` automatically.

## Setup Instructions

### Method 1: LLM Provider Settings Panel (Recommended)

The LLM Provider Settings panel provides a visual interface to configure all providers. It can be accessed from the Ansible Development Tools (ADT) sidebar under the Generative AI section, or from the Command Palette.

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run: `Ansible Lightspeed: Open LLM Provider Settings`
3. The panel displays all available providers (IBM watsonx, Google Gemini, Red Hat AI)
4. Click **Edit** on the provider you want to configure
5. Fill in the required fields (API Endpoint, API Key, Model Name, etc.)
6. Click **Save**
7. Click **Connect** to validate the connection
8. Click **Switch to this Provider** to make it the active provider

Provider settings are stored securely: API keys use VS Code's secret storage, and other values are kept in global state. This approach avoids storing sensitive credentials in plain-text settings files.

### Method 2: Guided Configuration (Command Palette)

This method uses a step-by-step Command Palette flow with input prompts instead of the visual panel.

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run: `Ansible Lightspeed: Configure LLM Provider`
3. Select your desired provider from the list
4. Enter the required configuration details when prompted
5. Test the connection when prompted

### Method 3: Workspace Configuration (Legacy)

> **Note:** The `ansible.lightspeed.provider`, `apiEndpoint`, `modelName`, and `apiKey` settings in `settings.json` are deprecated. Existing values are automatically migrated to the LLM Provider Settings panel on first activation. The Red Hat AI provider is not available through the legacy `settings.json` settings (the `ansible.lightspeed.provider` enum only includes `wca` and `google`). Use the LLM Provider Settings panel or the `Ansible Lightspeed: Configure LLM Provider` command to set up Red Hat AI.

For WCA, you can still use workspace settings:

```json
{
  "ansible.lightspeed.enabled": true
}
```

## Configuration Settings

Settings managed through the LLM Provider Settings panel:

| Setting      | Description                | Default                              | Applicable To            |
| ------------ | -------------------------- | ------------------------------------ | ------------------------ |
| API Endpoint | API endpoint URL           | Varies per provider (see note below) | WCA, Google, Red Hat AI  |
| API Key      | API key for authentication |                                      | Google, Red Hat AI       |
| Model Name   | Model name/ID to use       |                                      | Google, Red Hat AI       |
| Max Tokens   | Max tokens per response    | `1600`                               | Red Hat AI               |

**API Endpoint defaults:**

- **WCA:** `https://c.ai.ansible.redhat.com`
- **Google:** `https://generativelanguage.googleapis.com/v1beta` (fixed; custom URLs only for local testing/proxies)
- **Red Hat AI:** Required, no default. Must point to an OpenAI-compatible endpoint.

Global settings in `settings.json`:

| Setting                                     | Description                       | Default |
| ------------------------------------------- | --------------------------------- | ------- |
| `ansible.lightspeed.enabled`                | Enable/disable Ansible Lightspeed | `true`  |
| `ansible.lightspeed.timeout`                | Request timeout in milliseconds   | `30000` |
| `ansible.lightspeed.suggestions.enabled`    | Enable inline suggestions (WCA)   | `true`  |
| `ansible.lightspeed.suggestions.waitWindow` | Delay before inline suggestion    | `0`     |

## Usage

Once configured, LLM providers work seamlessly with existing Ansible Lightspeed features.

### Playbook Generation

1. Open the Command Palette or right-click in an Ansible file
2. Select **Generate Ansible Playbook with Lightspeed**
3. Enter your requirements
4. Review the generated outline and edit steps if needed
5. Accept the generated playbook

**Example prompt:**

```text
Install nginx, enable the service, and configure a virtual host
for example.com on RHEL 9
```

### Role Generation

1. Open the Command Palette or right-click in an Ansible file
2. Select **Generate Ansible Role with Lightspeed**
3. Enter your requirements
4. Review the generated outline and edit steps if needed
5. Accept the generated role

**Example prompt:**

```text
Create a role that installs PostgreSQL, initializes the database,
creates an application user, and enables the service
```

### Playbook Explanation

1. Open an existing Ansible playbook in the editor
2. Right-click in the editor
3. Select **Explain the current Ansible playbook with Lightspeed**
4. The provider returns a Markdown explanation with a titled paragraph for each task, describing its purpose and the parameters used

**Example:** Given a playbook that installs and configures Apache, the explanation output includes a heading and paragraph for each task with details on the modules and parameters involved.

### Role Explanation

1. Open a file inside an Ansible role (e.g., `tasks/main.yml`)
2. Right-click in the editor
3. Select **Explain the current Ansible role with Lightspeed**
4. The provider aggregates all role files and returns a Markdown explanation covering each task in the role

### Interactive Chat

1. Open the Ansible Lightspeed panel
2. Use the chat interface to ask Ansible-related questions
3. The LLM provider will provide Ansible-specific assistance

## Provider Management Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Ansible Lightspeed: Open LLM Provider Settings` - Open the settings panel
- `Ansible Lightspeed: Configure LLM Provider` - Guided setup
- `Ansible Lightspeed: Test Provider Connection` - Verify connectivity
- `Ansible Lightspeed: Show Provider Status` - View current configuration
- `Ansible Lightspeed: Switch Provider` - Change the active provider

## Switching Between Providers

Use the LLM Provider Settings panel to switch providers:

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run: `Ansible Lightspeed: Open LLM Provider Settings`
3. Click **Switch to this Provider** on the provider you want to activate

Or use the quick switch command:

1. Open the Command Palette
2. Run: `Ansible Lightspeed: Switch Provider`
3. Select your desired provider from the list

## Security Considerations

1. **API Key Storage:** API keys entered through the LLM Provider Settings panel are stored in VS Code's secret storage, not in plain-text settings files.

2. **Data Privacy:** When using LLM providers, your Ansible code and prompts are sent to external services. Review each provider's privacy policy.

3. **Workspace Settings:** For team projects, avoid committing API keys to version control. Use the LLM Provider Settings panel or environment variables.

4. **Network Security:** Ensure your network allows HTTPS connections to the provider endpoints.

## Troubleshooting

### Connection Issues

1. **Test Connection:** Use the **Connect** button in the LLM Provider Settings panel or run:

   ```text
   Command Palette > Ansible Lightspeed: Test Provider Connection
   ```

2. **Check API Key:** Ensure your API key is valid and has sufficient credits/quota.

3. **Verify Endpoint:** Confirm the API endpoint URL is correct. For Red Hat AI, the endpoint must expose `/v1/chat/completions`.

4. **Network Access:** Check firewall/proxy settings for connectivity to the provider endpoint.

### Common Error Messages

| Error                                   | Solution                                                    |
| --------------------------------------- | ----------------------------------------------------------- |
| "Authentication failed"                 | Check your API key                                          |
| "Rate limit exceeded"                   | Wait and try again, or check your quota                     |
| "Request timeout"                       | Increase timeout setting or check network                   |
| "Model not found"                       | Verify the model name is correct for your provider          |
| "Base URL must use http:// or https://" | Ensure the API endpoint starts with `http://` or `https://` |

### Debug Information

Check the "Ansible Support" output channel in VS Code for detailed provider logs.

## Model Recommendations

### IBM watsonx (WCA) Models

Uses organization default model. No manual model selection needed.

### Google Gemini Models

- **For Code Generation:** `gemini-2.5-flash` or `gemini-1.5-pro`
- **For Chat/Explanations:** `gemini-2.5-flash` (fast and cost-effective)

### Red Hat AI Models

The supported models in Red Hat AI platform depend on what is deployed at your endpoint. Common models include:

- `Granite-3.3-8B-Instruct` (general-purpose Ansible tasks)
- `DeepSeek-R1-Distill-Qwen-14B-W4A16` (complex reasoning)

## Known Limitations

### All Non-WCA Providers

- Content source matching is not available. Only WCA provides training data attribution.

### Red Hat AI Limitations

- The API endpoint must be an OpenAI-compatible service exposing `/v1/chat/completions`.
- There is no default model. You must specify a valid model name available at your endpoint.
- Max tokens defaults to 1600. Adjust this value based on your model's capabilities.
- Role generation produces only the `tasks/main.yml` file. Other role directories (handlers, vars, defaults, templates) are not generated.

### Provider-Specific

- Rate limits and quotas vary by provider and deployment.
- Model capabilities and response quality differ across models.
- Costs vary by usage and provider billing model.

## Prerequisites

| Requirement                              | WCA | Google | Red Hat AI |
| ---------------------------------------- | --- | ------ | ---------- |
| Ansible Lightspeed enabled               | Yes | Yes    | Yes        |
| Red Hat SSO / OAuth2                     | Yes | No     | No         |
| API Key                                  | No  | Yes    | Yes        |
| API Endpoint                             | Yes | Auto   | Yes        |
| Model Name                               | No  | Yes    | Yes        |
| Network access to provider endpoint      | Yes | Yes    | Yes        |
| Ansible Automation Platform subscription | Yes | No     | No         |

## Support

For issues with LLM provider integration:

1. Check this documentation
2. Test your provider configuration using the LLM Provider Settings panel
3. Review the troubleshooting section
4. File an issue on the [Ansible VS Code Extension repository](https://github.com/ansible/vscode-ansible/issues)

For provider-specific issues (API keys, billing, model availability), contact your provider's support directly.
