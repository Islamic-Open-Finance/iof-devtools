# Contributing to Islamic Open Finance

Thank you for your interest in contributing to Islamic Open Finance. This document provides guidelines and instructions for contributing.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior via GitHub Issues.

## Reporting Bugs

If you find a bug, please open a [GitHub Issue](../../issues) with the following information:

- A clear and descriptive title
- Steps to reproduce the problem
- Expected behavior vs. actual behavior
- Your environment (OS, Node.js version, pnpm version)
- Any relevant logs or error messages

## Submitting Changes

1. **Fork** the repository on GitHub.
2. **Create a branch** from `main` for your changes:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Make your changes** following the code style guidelines below.
4. **Commit your changes** using conventional commit messages (see below).
5. **Push** your branch to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
6. **Open a Pull Request** against the `main` branch with a clear description of your changes.

## Development Setup

### Prerequisites

- **Node.js** 22 or later
- **pnpm** 9.14.2 or later
- **TypeScript** 5.7 or later

### Getting Started

```bash
# Clone your fork
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>

# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test

# Check formatting
pnpm format:check

# Run linting
pnpm lint

# Run type checking
pnpm typecheck
```

## Code Style

- **Prettier** is used for code formatting. Run `pnpm format:check` before submitting.
- **ESLint** is used for linting. Run `pnpm lint` to check for issues.
- **TypeScript strict mode** is enabled. All code must pass `pnpm typecheck`.
- Use explicit types rather than relying on type inference for public APIs.
- Keep functions focused and under 70 lines where possible.

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `chore`: Maintenance tasks
- `refactor`: Code refactoring without behavior changes
- `test`: Adding or updating tests
- `ci`: Changes to CI/CD configuration

**Examples:**

```
feat(sdk): add webhook signature verification
fix(cli): resolve authentication token refresh issue
docs: update API usage examples
```

## Shariah Compliance

All financial logic contributed to this project must comply with [AAOIFI](https://aaoifi.com/) (Accounting and Auditing Organization for Islamic Financial Institutions) standards. Specifically:

- Islamic contract schemas must include `shariahStructure`, `boardApproval`, `fatwahReference`, and `annualAudit` fields.
- No interest-based (riba) financial calculations are permitted.
- All profit-and-loss sharing arrangements must follow Shariah Standards SS-8 through SS-39 as applicable.
- Contributors working on financial logic should familiarize themselves with the relevant AAOIFI standards for the contract type they are modifying.

If you are unsure whether a change complies with Shariah requirements, please note this in your Pull Request so reviewers can assess it.

## License

By contributing to this project, you agree that your contributions will be licensed under the [Apache License 2.0](./LICENSE).

Copyright 2025 Islamic Open Finance. All rights reserved.
