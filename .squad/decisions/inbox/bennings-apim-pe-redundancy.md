# Decision: APIM Private Endpoint Redundancy in Enterprise Architecture

**Decision Owner:** Bennings (Azure Cloud Architect)  
**Date:** 2025 (session)  
**Status:** Implemented  
**References:** Microsoft Learn - "Use a virtual network to secure inbound or outbound traffic for Azure API Management"

## Problem

The Forge enterprise architecture diagram showed **both**:
1. APIM Subnet (VNet-injected, internal mode)
2. Private Endpoint (APIM)

This raised the question: Are these redundant? If APIM is already VNet-injected with a private IP in the dedicated subnet, why also create a separate Private Endpoint?

## Analysis

Microsoft Learn documentation clarifies that VNet injection and inbound Private Endpoints are **separate, alternative networking models**, not complementary:

| Model | Access | Use Case |
|-------|--------|----------|
| **VNet Injection (Internal Mode)** | Private IP via internal load balancer; accessed via VPN/ExpressRoute | Air-gap, hybrid cloud, internal-only APIs |
| **Inbound Private Endpoint** | Multiple private connections via Azure Private Link | Fallback for basic tiers; multi-path external access |

For Forge's architecture:
- APIM is Premium tier (required for VNet injection)
- APIM is in **internal mode** (no public endpoint)
- Clients are on-premises or in corp network (VPN/ExpressRoute)
- Traffic flow: Developer → VPN/ExpressRoute → VNet → APIM Subnet → APIM (private IP)

With VNet-injected APIM, the private IP is already available within the subnet. Adding a Private Endpoint creates a redundant access path and unnecessarily complicates the topology.

## Decision

✅ **Remove the APIM Private Endpoint block from the enterprise architecture diagram.**

Rationale:
1. VNet injection already provides private IP access with full network control
2. Private Endpoint is an alternative for scenarios that can't use injection
3. Adding PE when already using injection adds operational overhead without security or resilience benefit
4. Single, clear data path is preferable for air-gap compliance: VPN/ExpressRoute → VNet → APIMSubnet → APIM

## Changes Made

- Removed `PEAPIM` (Private Endpoint for APIM) node from diagram
- Removed VNet → PEAPIM → APIM edges; traffic now flows VPN → VNet → APIMSubnet → APIM
- Updated Components table (removed APIM PE row)
- Clarified Private DNS Zones: `*.azure-api.net` resolves to internal subnet IP, not a separate PE
- Added guidance that VNet injection is the recommended air-gap approach

## Impact

**Reduces complexity** without sacrificing security or functionality. Enterprise customers deploying Forge now have a clearer, more accurate reference architecture aligned with Azure best practices.

---

**To Merge:**  
The decision will be merged into `.squad/decisions.md` by the Scribe during standard decision processing. No action required.
