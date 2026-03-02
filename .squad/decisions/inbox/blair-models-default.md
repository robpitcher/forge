### Default models changed to empty array
**By:** Blair
**Date:** $(date -u +%Y-%m-%dT%H:%M:%SZ)
**What:** Changed `forge.copilot.models` default from `["gpt-4.1", "gpt-4o", "gpt-4o-mini"]` to `[]`. Updated setting description to clarify that values must match the Azure AI Foundry **model deployment name** (not the model name, as they can differ).
**Why:** Hardcoded model names are meaningless in air-gapped BYOK deployments — users must configure their own deployment names. An empty default avoids confusing "model not found" errors and forces explicit setup.
**Impact:** Users who previously relied on the default models list will now need to add their deployment names in settings before first use. The model selector will show empty until configured.
