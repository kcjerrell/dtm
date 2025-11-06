#![allow(non_upper_case_globals)]
#![allow(non_camel_case_types)]
#![allow(non_snake_case)]
#![allow(deref_nullptr)]

include!(concat!(env!("OUT_DIR"), "/bindings.rs"));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compress_array() {
        let nx = 100;
        let ny = 100;
        let nz = 100;

        let mut array: Vec<f32> = vec![0.0; nx * ny * nz];

        for i in 0..nx {
            for j in 0..ny {
                for k in 0..nz {
                    let x = 2.0 * (i as f32) / (nx as f32);
                    let y = 2.0 * (j as f32) / (ny as f32);
                    let z = 2.0 * (k as f32) / (nz as f32);
                    array[i + nx * (j + ny * k)] = (-(x * x + y * y + z * z)).exp();
                }
            }
        }

        /* allocate buffer for compressed data */
        let bufsize = 1024 + array.len() * std::mem::size_of::<f32>();
        let mut buffer: Vec<u8> = vec![0; bufsize];

        /* compress to memory */
        let fpz =
            unsafe { fpzip_write_to_buffer(buffer.as_mut_ptr() as *mut std::ffi::c_void, bufsize) };

        unsafe {
            (*fpz).type_ = FPZIP_TYPE_FLOAT as i32;
            (*fpz).prec = 16;
            (*fpz).nx = nx as i32;
            (*fpz).ny = ny as i32;
            (*fpz).nz = nz as i32;
            (*fpz).nf = 1;
        }

        let stat = unsafe { fpzip_write_header(fpz) };

        if stat == 0 {
            assert!(false)
        };

        let outbytes = unsafe { fpzip_write(fpz, array.as_ptr() as *const std::ffi::c_void) };

        if outbytes == 0 {
            assert!(false)
        };

        unsafe { fpzip_write_close(fpz) };

        assert!(true);
    }
}
