# LLM Provider Support for Ansible Lightspeed

The Ansible VS Code extension supports multiple LLM providers including Red Hat's Ansible Lightspeed with watsonx Code Assistant (WCA), as well as OpenAI, Google Gemini, and custom OpenAI-compatible APIs for Ansible code generation and assistance.

## Supported Features

When using LLM providers, the following Ansible Lightspeed features are available:

✅ **Supported in Phase 1:**

- Playbook Generation
<<<<<<< HEAD
- Role Generation
=======
- Role Generation  
>>>>>>> 84cfad07 (Add LLM provider under lighspeed)
- Interactive Chat (if provider supports it)

❌ **Not Supported in Phase 1:**

- Inline Task Suggestions
- Content Source Matching

## Supported Providers

### OpenAI

Direct access to OpenAI models.

**Configuration:**

- Provider: `openai`
- API Endpoint: `https://api.openai.com/v1` (⚠️ **fixed, not configurable**)
- API Key: Your OpenAI API key (starts with `sk-`)
- Model Name: e.g., `gpt-4o`, `gpt-4`, `gpt-3.5-turbo`

### Google Gemini

Direct access to Google Gemini models.

**Configuration:**

- Provider: `google`
- API Endpoint: `https://generativelanguage.googleapis.com/v1beta` (⚠️ **fixed, not configurable**)
- API Key: Your Google AI API key (starts with `AIza`)
- Model Name: e.g., `gemini-2.5-flash`, `gemini-1.5-pro`

### Custom Provider

Configure any OpenAI-compatible API.

**Configuration:**

- Provider: `custom`
- API Endpoint: **Your custom API endpoint (required)**
- API Key: Your API key
- Model Name: Your model identifier

> **Note:** For OpenAI and Google providers, the API endpoint is automatically set and cannot be changed. If you need a custom endpoint (e.g., for Azure OpenAI, local LLM servers, or corporate proxies), use the `Custom` provider option.

## Setup Instructions

### Method 1: Guided Configuration (Recommended)

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run: `Ansible Lightspeed: Configure LLM Provider`
3. Select your desired provider from the list (OpenAI, Google, Custom, or WCA)
4. Enter the required configuration details when prompted
5. Test the connection when prompted

### Quick Provider Selection

1. Open VS Code Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "Ansible Lightspeed Provider"
3. Select from the dropdown: `WCA`, `OpenAI`, `Google`, or `Custom`
4. Configure the required settings based on your selection

### Method 2: Manual Configuration

1. Open VS Code Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "Ansible Lightspeed"
3. Configure the following settings:

**For OpenAI:**

```json
{
  "ansible.lightspeed.enabled": true,
  "ansible.lightspeed.provider": "openai",
  // apiEndpoint is automatically set to https://api.openai.com/v1 (not configurable)
  "ansible.lightspeed.apiKey": "your-openai-api-key",
  "ansible.lightspeed.modelName": "gpt-4"
}
```

**For Google Gemini:**

```json
{
  "ansible.lightspeed.enabled": true,
  "ansible.lightspeed.provider": "google",
  // apiEndpoint is automatically set (not configurable)
  "ansible.lightspeed.apiKey": "your-google-api-key",
  "ansible.lightspeed.modelName": "gemini-2.5-flash"
}
```

**For WCA (default):**

```json
{
  "ansible.lightspeed.enabled": true,
  "ansible.lightspeed.provider": "wca",
  "ansible.lightspeed.apiEndpoint": "https://c.ai.ansible.redhat.com"
}
```

### Method 3: Workspace Configuration

Add to your workspace `.vscode/settings.json`:

```json
{
  "ansible.lightspeed.enabled": true,
  "ansible.lightspeed.provider": "openai",
  // apiEndpoint is automatically set to https://api.openai.com/v1 (not configurable)
  "ansible.lightspeed.apiKey": "${env:OPENAI_API_KEY}",
  "ansible.lightspeed.modelName": "gpt-4"
}
```

## Configuration Settings

| Setting | Description | Default | Applicable To |
|---------|-------------|---------|---------------|
| `ansible.lightspeed.enabled` | Enable/disable Ansible Lightspeed | `true` | All providers |
| `ansible.lightspeed.provider` | Provider selection | `wca` | All providers |
| `ansible.lightspeed.apiEndpoint` | API endpoint URL | `https://c.ai.ansible.redhat.com` | **WCA and Custom only** |
| `ansible.lightspeed.modelName` | Model name/ID to use | `""` | All providers |
| `ansible.lightspeed.apiKey` | API key for authentication | `""` | LLM providers only (not WCA) |
| `ansible.lightspeed.timeout` | Request timeout in milliseconds | `30000` | All providers |
| `ansible.lightspeed.customHeaders` | Custom HTTP headers (JSON object) | `{}` | Third-party only |

## Usage

Once configured, LLM providers work seamlessly with existing Ansible Lightspeed features:

### Playbook Generation

1. Right-click in an Ansible file
2. Select "Generate Ansible Playbook with Lightspeed"
3. Enter your requirements
4. The configured LLM provider will generate the playbook

### Role Generation

1. Right-click in an Ansible file
<<<<<<< HEAD
2. Select "Generate Ansible Role with Lightspeed"
=======
2. Select "Generate Ansible Role with Lightspeed"  
>>>>>>> 84cfad07 (Add LLM provider under lighspeed)
3. Enter your requirements
4. The configured LLM provider will generate the role structure

### Interactive Chat

1. Open the Ansible Lightspeed panel
2. Use the chat interface to ask Ansible-related questions
3. The LLM provider will provide Ansible-specific assistance

## Provider Management Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Ansible Lightspeed: Configure LLM Provider` - Guided setup
- `Ansible Lightspeed: Test Provider Connection` - Verify connectivity
- `Ansible Lightspeed: Show Provider Status` - View current configuration
- `Ansible Lightspeed: Switch Provider` - Change between WCA and LLM providers

## Switching Between Providers

You can easily switch between providers using the dropdown:

1. **Open Settings:** `Ctrl+,` / `Cmd+,`
2. **Search:** "Ansible Lightspeed Provider"
3. **Select:** Choose from the dropdown (`WCA`, `OpenAI`, `Google`, or `Custom`)
4. **Configure:** Update `apiKey` and `modelName` as needed for the selected provider

**Or use the Command Palette:**

1. `Ctrl+Shift+P` / `Cmd+Shift+P`
2. Run: `Ansible Lightspeed: Switch Provider`
3. Select your desired provider from the list

## Security Considerations

⚠️ **Important Security Notes:**

1. **API Key Storage:** API keys are stored in VS Code settings. Consider using environment variables for sensitive keys.

2. **Data Privacy:** When using LLM providers, your Ansible code and prompts are sent to external services. Review each provider's privacy policy.

3. **Workspace Settings:** For team projects, avoid committing API keys to version control. Use environment variables or user-specific settings.

4. **Network Security:** Ensure your network allows HTTPS connections to the provider endpoints.

## Troubleshooting

### Connection Issues

1. **Test Connection:**

   ```text
   Command Palette > Ansible Lightspeed: Test Provider Connection
   ```

2. **Check API Key:** Ensure your API key is valid and has sufficient credits/quota

3. **Verify Endpoint:** Confirm the API endpoint URL is correct

4. **Network Access:** Check firewall/proxy settings

### Common Error Messages

| Error | Solution |
|-------|----------|
| "Authentication failed" | Check your API key |
| "Rate limit exceeded" | Wait and try again, or check your quota |
| "Request timeout" | Increase timeout setting or check network |
| "Model not found" | Verify the model name is correct for your provider |

### Debug Information

Enable debug logging by setting:

```json
{
  "ansible.lightspeed.debug": true
}
```

Check the "Ansible Support" output channel for detailed logs.

## Model Recommendations

### For Code Generation

- **OpenAI:** `gpt-4o`, `gpt-4`, or `gpt-4-turbo`
- **Google:** `gemini-2.5-flash` or `gemini-1.5-pro`

### For Chat/Explanations

- **OpenAI:** `gpt-3.5-turbo` (balanced performance)
- **Google:** `gemini-2.5-flash` (fast and cost-effective)

## Limitations

1. **Phase 1 Limitations:**
   - No inline task suggestions
   - No content source matching
   - Limited to playbook and role generation

2. **Provider-Specific:**
   - Rate limits vary by provider
   - Model capabilities differ
   - Costs vary by usage

3. **Authentication:**
   - No Red Hat SSO integration
   - No Ansible Automation Platform subscription validation

## Support

For issues with LLM provider integration:

1. Check this documentation
2. Test your provider configuration
3. Review the troubleshooting section
4. File an issue on the [Ansible VS Code Extension repository](https://github.com/ansible/vscode-ansible/issues)

For provider-specific issues (API keys, billing, model availability), contact your provider's support directly.
