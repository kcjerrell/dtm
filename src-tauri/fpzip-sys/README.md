# fpzip-sys
Raw Rust bindings to FPZIP (https://github.com/LLNL/fpzip).

An example compression function for a 1D f32 vector:

```
use fpzip_sys::*;

// ...

fn fpzip_compress(src: &Vec<f32>, high_quality: bool) -> Option<Vec<u8>> {
    let prec = if high_quality {
        24
    } else {
        16
    };
    
    /* allocate buffer for compressed data */
    let bufsize = 1024 + src.len() * std::mem::size_of::<f32>();
    let mut buffer: Vec<u8> = vec![0; bufsize];

    /* compress to memory */
    let fpz = unsafe {
        fpzip_write_to_buffer(buffer.as_mut_ptr() as *mut std::ffi::c_void, bufsize as u64)
    };

    unsafe {
        (*fpz).type_ = FPZIP_TYPE_FLOAT as i32;
        (*fpz).prec = prec;
        (*fpz).nx = src.len() as i32;
        (*fpz).ny = 1;
        (*fpz).nz = 1;
        (*fpz).nf = 1;
    }

    let stat = unsafe { fpzip_write_header(fpz) };

    if stat == 0 {
        unsafe { fpzip_write_close(fpz) };
        return None;
    };

    let outbytes = unsafe { fpzip_write(fpz, src.as_ptr() as *const std::ffi::c_void) };

    unsafe { fpzip_write_close(fpz) };

    if outbytes == 0 {
        return None;
    };

    println!("[fpzip::compress] {} reduced to {} bytes.", src.len() * std::mem::size_of::<f32>(), outbytes);

    return Some(buffer[0..outbytes as usize].to_vec());
}
```