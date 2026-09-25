// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";

/// @dev The role bitmap a Chef receives on their own `<alias>.sapore.eth`
///      resource at registration.
///
/// Deliberately narrower than ENSv2's own tutorial default (which also
/// grants ROLE_SET_SUBREGISTRY[_ADMIN] and ROLE_CAN_TRANSFER_ADMIN). Two
/// roles are omitted on purpose, not by oversight:
///
///  - ROLE_SET_SUBREGISTRY[_ADMIN]: lets an owner deploy their own
///    sub-subname registry (e.g. `x.alice.sapore.eth`). Nothing in Sapore
///    uses that, so it isn't granted.
///  - ROLE_CAN_TRANSFER_ADMIN: per ENSv2's docs, this role IS the transfer
///    permission itself, not a meta-role gating who can grant it — a Chef
///    holding it could sell or trade `alias.sapore.eth` to anyone. That
///    directly undermines the World ID story: a sybil could buy a verified
///    identity instead of proving they're a unique human. Names are
///    transferable only by Sapore (the registry admin), never by the Chef.
///
/// What's left is exactly ROLE_SET_RESOLVER[_ADMIN] — enough for a Chef to
/// point their name at their own records and delegate that if they choose,
/// nothing more. Same "minimum sufficient" discipline the World ID
/// integration argues for its credential; here it's argued for a role
/// bitmap instead.
uint256 constant CHEF_REGISTRATION_ROLE_BITMAP =
    RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_RESOLVER_ADMIN;

/**
 * @title SaporeChefRegistrar
 * @notice Registers `<alias>.sapore.eth` subnames for verified Chefs.
 *
 * Based on ENSv2's "For Contract Developers" SimpleSubnameRegistrar
 * tutorial, with two deliberate simplifications beyond the role bitmap
 * above, both chosen to minimize custom, unaudited Solidity rather than to
 * add features:
 *
 *  - No commit-reveal. The tutorial itself notes this is normally only
 *    needed when front-running a public, permissionless registration flow
 *    is a real risk. Ours isn't public — register() reverts for anyone but
 *    BACKEND, Sapore's own backend, which is what actually verifies the
 *    caller is a unique human for World ID and confirms the alias is free
 *    before ever calling this contract. There's nothing to front-run.
 *  - No renew() / ROLE_RENEW. Chef identities are meant to be permanent, not
 *    a subscription — register() mints with `expiry = type(uint64).max`.
 *    This also means the registry only needs to grant this contract
 *    ROLE_REGISTRAR, not ROLE_REGISTRAR | ROLE_RENEW: one less role, one
 *    less thing that could be misconfigured.
 *
 * PRICE is 0 by design: Sapore isn't monetizing identity, it's a perk of
 * verified Chef status. The ERC20 payment path is kept (rather than removed)
 * so the deployment shape stays close to the vetted tutorial pattern; a
 * zero-amount `safeTransferFrom` is a no-op on standard ERC20 tokens and
 * needs no prior `approve()` call.
 */
contract SaporeChefRegistrar {
    using SafeERC20 for IERC20;

    error NameNotAvailable(string label);
    error InvalidOwner();
    error InvalidBeneficiary();
    error InvalidBackend();
    error Unauthorized();

    event ChefNameRegistered(
        uint256 indexed tokenId, string label, address owner, uint256 price
    );

    IPermissionedRegistry public immutable REGISTRY;
    IERC20 public immutable PAYMENT_TOKEN;
    address public immutable BENEFICIARY;
    uint256 public immutable PRICE;
    /// @dev The only account allowed to call register() — Sapore's backend,
    ///      which is what actually runs the World ID + availability checks
    ///      before ever reaching this contract. Nothing else in this
    ///      contract enforces "only a verified Chef can register" on its
    ///      own; without this check, register() would be open to anyone.
    address public immutable BACKEND;

    constructor(
        IPermissionedRegistry registry,
        IERC20 paymentToken,
        address beneficiary,
        uint256 price,
        address backend
    ) {
        // Both immutable — an address(0) mistake here is permanent, not
        // just a footgun for the price=0 no-op case below.
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (backend == address(0)) revert InvalidBackend();

        REGISTRY = registry;
        PAYMENT_TOKEN = paymentToken;
        BENEFICIARY = beneficiary;
        PRICE = price;
        BACKEND = backend;
    }

    function isAvailable(string calldata label) public view returns (bool) {
        IPermissionedRegistry.State memory state =
            REGISTRY.getState(uint256(keccak256(bytes(label))));
        return state.status == IPermissionedRegistry.Status.AVAILABLE;
    }

    /// @notice Registers `<label>.sapore.eth` for `owner`, permanently.
    /// @dev Not front-runnable in practice — see the contract-level note —
    ///      so no commit-reveal. Restricted to BACKEND, which is what
    ///      actually runs the World ID + availability checks; this contract
    ///      holding ROLE_REGISTRAR on the underlying registry is a separate,
    ///      necessary-but-not-sufficient condition — it controls who this
    ///      contract can register on, not who can call this contract.
    function register(string calldata label, address owner, address resolver)
        external
        returns (uint256 tokenId)
    {
        if (msg.sender != BACKEND) revert Unauthorized();
        if (!isAvailable(label)) revert NameNotAvailable(label);
        if (owner == address(0)) revert InvalidOwner();

        if (PRICE > 0) {
            PAYMENT_TOKEN.safeTransferFrom(msg.sender, BENEFICIARY, PRICE);
        }

        tokenId = REGISTRY.register(
            label,
            owner,
            IRegistry(address(0)), // no child registry — Chefs don't get sub-subnames
            resolver,
            CHEF_REGISTRATION_ROLE_BITMAP,
            type(uint64).max // permanent — no renewal, no expiry
        );

        // forge's reentrancy-events lint flags this: the event's tokenId is
        // only known after REGISTRY.register() returns, so it can't be
        // emitted earlier. Accepted as-is — only BACKEND can reach this
        // point at all (checked above), and REGISTRY is ENSv2's own
        // protocol contract, not arbitrary/attacker-supplied.
        emit ChefNameRegistered(tokenId, label, owner, PRICE);
    }
}
