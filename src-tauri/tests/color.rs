mod tests {
    use candle_core::{Device, Tensor};
    use dtm_lib::dtp_service::embeddings::color::ColorEmbedding;
    use dtm_lib::dtp_service::embeddings::task::EmbeddingGenerator;

    const TEST_IMAGE: &str =
        "/Users/kcjer/Library/Application Support/com.kcjer.dtm/dev_images/4zowf50stl28.png";
    const TEST_IMAGE_2: &str = "/Users/kcjer/Downloads/okhsl_s_slice_100.png";

    #[tokio::test]
    async fn test_color_embedding() -> Result<(), anyhow::Error> {
        let mut img = image::load(
            std::io::BufReader::new(std::fs::File::open(TEST_IMAGE_2).unwrap()),
            image::ImageFormat::Png,
        )
        .unwrap();
        let rgb = img.to_rgb8();
        let pixels = rgb.into_raw();

        let device = Device::metal_if_available(0)?;
        let t = Tensor::from_vec(
            pixels,
            (img.width() as usize, img.height() as usize, 3),
            &device,
        )?
        .permute((2, 0, 1))?
        .to_dtype(candle_core::DType::F32)?;

        println!(
            "t: {} - {}",
            t.min_all()?.to_scalar::<f32>()?,
            t.max_all()?.to_scalar::<f32>()?
        );

        let t = t.affine(1.0 / 255.0, 0.0)?;

        println!(
            "t: {} - {}",
            t.min_all()?.to_scalar::<f32>()?,
            t.max_all()?.to_scalar::<f32>()?
        );

        let color = ColorEmbedding {};
        let result = color
            .get_embeddings(vec![t].as_slice())
            .inspect_err(|e| println!("Result is err: {:?}", e));

        assert!(result.is_ok());
        Ok(())
    }
}
