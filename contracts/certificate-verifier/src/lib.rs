#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env};

// ── Storage Keys ────────────────────────────────────────────────────
// Each variant maps to a unique key in the contract's storage.
#[contracttype]
pub enum DataKey {
    Admin,            // stores the admin (issuer) Address
    Cert(BytesN<32>), // stores a boolean flag per certificate hash
}

// ── Contract Definition ─────────────────────────────────────────────
#[contract]
pub struct CertificateVerifier;

#[contractimpl]
impl CertificateVerifier {
    // ── Initialize ──────────────────────────────────────────────────
    // Call once after deployment to set the admin (issuer) address.
    // Panics if already initialized.
    pub fn initialize(env: Env, admin: Address) {
        // Ensure the contract hasn't been initialized yet
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    // ── Add Certificate ─────────────────────────────────────────────
    // Only the admin can call this to register a new certificate hash.
    // `admin` must match the stored admin and provide valid auth.
    pub fn add_certificate(env: Env, admin: Address, hash: BytesN<32>) {
        // 1. Require cryptographic proof that `admin` approved this call
        admin.require_auth();

        // 2. Verify the caller is the stored admin
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin)
            .expect("not initialized");
        if admin != stored_admin {
            panic!("only admin can add certificates");
        }

        // 3. Store the certificate hash (value = true)
        env.storage().persistent().set(&DataKey::Cert(hash), &true);
    }

    // ── Verify Certificate ──────────────────────────────────────────
    // Anyone can call this to check whether a certificate hash exists.
    // Returns `true` if the hash has been registered, `false` otherwise.
    pub fn verify_certificate(env: Env, hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Cert(hash))
            .unwrap_or(false)
    }
}

mod test;
