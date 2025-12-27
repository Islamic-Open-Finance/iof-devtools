# IOF™ DevTools

Command-line tools and utilities for developing with the Islamic Open Finance™ (IOF) Platform.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

## Features

- ✅ **API Testing** - Test API endpoints from command line
- ✅ **Contract Validation** - Validate Shariah compliance
- ✅ **SDK Generation** - Generate client SDKs in multiple languages
- ✅ **Mock Data** - Generate realistic test data
- ✅ **Webhook Testing** - Test webhook integrations
- ✅ **Environment Management** - Switch between environments
- ✅ **Logging** - Beautiful formatted logs and debugging
- ✅ **Scaffolding** - Bootstrap new projects

## Installation

### Global Installation (Recommended)

```bash
npm install -g @iof/devtools
```

### Local Installation

```bash
npm install --save-dev @iof/devtools
```

## Quick Start

```bash
# Login to IOF Platform
iof login

# Test API endpoint
iof api call POST /api/v1/contracts/murabaha \
  --data '{"customer_id": "CUST-123", ...}'

# Validate Shariah compliance
iof shariah validate murabaha.json

# Generate SDK
iof sdk generate --lang typescript --output ./sdk

# Start mock server
iof mock start

# View logs
iof logs --follow
```

## Commands

### Authentication

#### `iof login`

Login to IOF Platform:

```bash
# Interactive login
iof login

# With API key
iof login --api-key iof_live_abc123

# With OAuth
iof login --oauth
```

#### `iof logout`

Logout from current session:

```bash
iof logout
```

#### `iof whoami`

Show current user/organization:

```bash
iof whoami
```

### API Testing

#### `iof api call`

Make API requests:

```bash
# GET request
iof api call GET /api/v1/contracts/murabaha

# POST with data
iof api call POST /api/v1/contracts/murabaha \
  --data '{"customer_id": "CUST-123", ...}'

# POST with file
iof api call POST /api/v1/contracts/murabaha \
  --file contract.json

# Custom headers
iof api call POST /api/v1/contracts/murabaha \
  --header "X-Idempotency-Key: abc123" \
  --data contract.json
```

#### `iof api test`

Run API test suite:

```bash
# Run all tests
iof api test

# Run specific test file
iof api test tests/contracts.yaml

# Run with coverage
iof api test --coverage
```

Example test file (`tests/contracts.yaml`):

```yaml
name: Murabaha Contract Tests
tests:
  - name: Create valid contract
    request:
      method: POST
      path: /api/v1/contracts/murabaha
      body:
        customer_id: CUST-123
        asset_category: VEHICLE
        cost_price: 50000
        profit_amount: 5000
    expect:
      status: 201
      body:
        status: DRAFT

  - name: Reject Shariah-violating contract
    request:
      method: POST
      path: /api/v1/contracts/murabaha
      body:
        customer_id: CUST-123
        asset_category: ALCOHOL
    expect:
      status: 422
      body:
        error.code: SHARIAH_BREACH
```

### Shariah Compliance

#### `iof shariah validate`

Validate Shariah compliance:

```bash
# Validate contract
iof shariah validate contract.json

# Validate with specific rules
iof shariah validate contract.json --rules murabaha

# Show detailed report
iof shariah validate contract.json --verbose
```

#### `iof shariah rules`

List Shariah rules:

```bash
# List all rules
iof shariah rules

# Filter by category
iof shariah rules --category CONTRACTS

# Show rule details
iof shariah rules --rule MUR_ASSET_HALAL
```

### Contract Management

#### `iof contracts create`

Create contract from template:

```bash
# Interactive creation
iof contracts create murabaha

# From file
iof contracts create murabaha --file template.json

# With parameters
iof contracts create murabaha \
  --customer CUST-123 \
  --asset "Toyota Camry 2024" \
  --cost 50000 \
  --profit 5000
```

#### `iof contracts list`

List contracts:

```bash
# List all contracts
iof contracts list

# Filter by status
iof contracts list --status ACTIVE

# Filter by type
iof contracts list --type MURABAHA

# JSON output
iof contracts list --format json
```

#### `iof contracts get`

Get contract details:

```bash
iof contracts get CNT-789

# Show payment schedule
iof contracts get CNT-789 --schedule

# Show lineage
iof contracts get CNT-789 --lineage
```

### SDK Generation

#### `iof sdk generate`

Generate client SDK:

```bash
# TypeScript
iof sdk generate --lang typescript --output ./sdk

# Python
iof sdk generate --lang python --output ./sdk

# Java
iof sdk generate --lang java --output ./sdk

# Go
iof sdk generate --lang go --output ./sdk

# All languages
iof sdk generate --lang all --output ./sdks
```

#### `iof sdk update`

Update existing SDK:

```bash
iof sdk update ./sdk
```

### Mock Server

#### `iof mock start`

Start mock server:

```bash
# Default mode (stateless)
iof mock start

# Stateful mode
iof mock start --stateful

# With seed data
iof mock start --seed

# Custom port
iof mock start --port 9000
```

#### `iof mock seed`

Load seed data:

```bash
# Load default seed data
iof mock seed

# Load custom data
iof mock seed --file custom-data.json

# Clear all data
iof mock seed --clear
```

### Webhooks

#### `iof webhooks listen`

Listen for webhook events:

```bash
# Start webhook listener
iof webhooks listen --port 3000

# Filter events
iof webhooks listen --events contract.created,contract.activated

# Save events to file
iof webhooks listen --save events.jsonl
```

#### `iof webhooks test`

Test webhook delivery:

```bash
# Test webhook URL
iof webhooks test https://your-app.com/webhooks

# Send test event
iof webhooks test https://your-app.com/webhooks \
  --event contract.created \
  --data contract.json
```

### Environment Management

#### `iof env`

Manage environments:

```bash
# List environments
iof env list

# Switch environment
iof env use production

# Show current environment
iof env current

# Add custom environment
iof env add staging \
  --url https://api.staging.islamicopenfinance.com \
  --api-key iof_staging_abc123
```

### Data Generation

#### `iof generate`

Generate mock data:

```bash
# Generate contracts
iof generate contracts --count 100 --output contracts.json

# Generate customers
iof generate customers --count 50 --output customers.json

# Generate cards
iof generate cards --count 30 --output cards.json

# Generate all
iof generate all --output test-data/
```

### Logs

#### `iof logs`

View logs:

```bash
# View recent logs
iof logs

# Follow logs (tail -f)
iof logs --follow

# Filter by service
iof logs --service contracts

# Filter by level
iof logs --level error

# Search logs
iof logs --grep "Shariah breach"

# JSON output
iof logs --format json
```

### Scaffolding

#### `iof init`

Initialize new project:

```bash
# Interactive setup
iof init

# Specify template
iof init --template typescript-express

# Specify language
iof init --lang typescript --framework fastify
```

Templates:

- `typescript-express` - TypeScript + Express
- `typescript-fastify` - TypeScript + Fastify
- `python-fastapi` - Python + FastAPI
- `java-spring` - Java + Spring Boot
- `go-gin` - Go + Gin

### Developer Portal

#### `iof portal`

Open developer portal:

```bash
# Open in browser
iof portal

# Open API keys page
iof portal keys

# Open documentation
iof portal docs
```

### Configuration

#### `iof config`

Manage configuration:

```bash
# Show configuration
iof config list

# Set value
iof config set api_key iof_live_abc123

# Get value
iof config get api_key

# Reset configuration
iof config reset
```

## Configuration File

Configuration is stored in `~/.iof/config.json`:

```json
{
  "environment": "production",
  "api_key": "iof_live_abc123",
  "environments": {
    "production": {
      "url": "https://api.islamicopenfinance.com",
      "api_key": "iof_live_abc123"
    },
    "sandbox": {
      "url": "https://api.sandbox.islamicopenfinance.com",
      "api_key": "iof_sandbox_xyz789"
    }
  },
  "defaults": {
    "format": "table",
    "timeout": 30000,
    "retry": 3
  }
}
```

## Environment Variables

Configure via environment variables:

```bash
export IOF_API_KEY=iof_live_abc123
export IOF_ENVIRONMENT=production
export IOF_LOG_LEVEL=debug
export IOF_TIMEOUT=30000
```

## Examples

### Complete Workflow

```bash
# 1. Login
iof login --api-key iof_sandbox_abc123

# 2. Switch to sandbox
iof env use sandbox

# 3. Create customer
iof api call POST /api/v1/customers \
  --file customer.json

# 4. Create Murabaha contract
iof contracts create murabaha \
  --customer CUST-123 \
  --asset "Toyota Camry 2024" \
  --cost 50000 \
  --profit 5000 \
  > contract.json

# 5. Validate Shariah compliance
iof shariah validate contract.json

# 6. Get contract details
iof contracts get CNT-789 --schedule

# 7. View logs
iof logs --service contracts --follow
```

### Testing Workflow

```bash
# 1. Start mock server
iof mock start --stateful --seed &

# 2. Generate test data
iof generate all --output test-data/

# 3. Run API tests
iof api test tests/

# 4. View results
iof logs --level error
```

### CI/CD Integration

```yaml
name: API Tests

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install IOF DevTools
        run: npm install -g @iof/devtools

      - name: Login
        run: iof login --api-key ${{ secrets.IOF_API_KEY }}

      - name: Run tests
        run: iof api test tests/

      - name: Validate contracts
        run: iof shariah validate contracts/
```

## Output Formats

All commands support multiple output formats:

```bash
# Table (default)
iof contracts list

# JSON
iof contracts list --format json

# YAML
iof contracts list --format yaml

# CSV
iof contracts list --format csv

# Pretty print
iof contracts list --format pretty
```

## Debugging

Enable debug mode:

```bash
# Enable debug logging
iof --debug api call POST /api/v1/contracts

# Very verbose
iof --verbose api call POST /api/v1/contracts

# Save debug log
iof --debug api call POST /api/v1/contracts > debug.log 2>&1
```

## Plugins

Extend functionality with plugins:

```bash
# Install plugin
iof plugins install @iof/plugin-analytics

# List plugins
iof plugins list

# Remove plugin
iof plugins remove @iof/plugin-analytics
```

## Development

### Build from Source

```bash
git clone https://github.com/Islamic-Open-Finance/iof-devtools.git
cd iof-devtools

npm install
npm run build
npm link
```

### Run Tests

```bash
npm test
```

### Create Plugin

```bash
iof plugins create my-plugin
```

## Troubleshooting

### Command Not Found

Make sure `@iof/devtools` is installed globally:

```bash
npm install -g @iof/devtools
```

### Authentication Error

Re-login:

```bash
iof logout
iof login
```

### API Timeout

Increase timeout:

```bash
iof config set timeout 60000  # 60 seconds
```

## Support

- **Documentation**: https://docs.islamicopenfinance.com/devtools
- **GitHub Issues**: https://github.com/Islamic-Open-Finance/iof-devtools/issues
- **Email**: support@islamicopenfinance.com

## License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

## Related Projects

- [IOF OpenAPI](https://github.com/Islamic-Open-Finance/iof-openapi) - OpenAPI specification
- [IOF SDKs](https://github.com/Islamic-Open-Finance/iof-sdks) - Client libraries
- [IOF Mock Server](https://github.com/Islamic-Open-Finance/iof-mock) - Mock server

---

**Built with ❤️ for the Islamic finance community**
