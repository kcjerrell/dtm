pub fn assert_vec_eq(actual: &[f32], expected: &[f32], epsilon: f32) {
    assert_eq!(actual.len(), expected.len());

    for (i, (a, e)) in actual.iter().zip(expected.iter()).enumerate() {
        assert!(
            (a - e).abs() <= epsilon,
            "Mismatch at index {i}: expected {e}, got {a}"
        );
    }
}
