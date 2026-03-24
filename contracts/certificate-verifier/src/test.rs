#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, BytesN, Env};

/// Helper: creates a sample 32-byte hash from a single byte value.
fn sample_hash(env: &Env, byte: u8) -> BytesN<32> {
    let mut buf = [0u8; 32];
    buf[0] = byte;
    BytesN::from_array(env, &buf)
}

#[test]
fn test_add_and_verify_certificate() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CertificateVerifier, ());
    let client = CertificateVerifierClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let hash = sample_hash(&env, 1);

    // Certificate should not exist yet
    assert_eq!(client.verify_certificate(&hash), false);

    // Admin adds the certificate
    client.add_certificate(&admin, &hash);

    // Now it should be verified
    assert_eq!(client.verify_certificate(&hash), true);
}

#[test]
fn test_verify_nonexistent_certificate() {
    let env = Env::default();
    let contract_id = env.register(CertificateVerifier, ());
    let client = CertificateVerifierClient::new(&env, &contract_id);

    let hash = sample_hash(&env, 42);

    // A hash that was never added should return false
    assert_eq!(client.verify_certificate(&hash), false);
}

#[test]
#[should_panic(expected = "only admin can add certificates")]
fn test_non_admin_cannot_add() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CertificateVerifier, ());
    let client = CertificateVerifierClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let intruder = Address::generate(&env);

    client.initialize(&admin);

    let hash = sample_hash(&env, 99);

    // Intruder tries to add — should panic
    client.add_certificate(&intruder, &hash);
}

#[test]
fn test_multiple_certificates() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(CertificateVerifier, ());
    let client = CertificateVerifierClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let hash_a = sample_hash(&env, 10);
    let hash_b = sample_hash(&env, 20);
    let hash_c = sample_hash(&env, 30);

    client.add_certificate(&admin, &hash_a);
    client.add_certificate(&admin, &hash_b);

    assert_eq!(client.verify_certificate(&hash_a), true);
    assert_eq!(client.verify_certificate(&hash_b), true);
    assert_eq!(client.verify_certificate(&hash_c), false); // never added
}
