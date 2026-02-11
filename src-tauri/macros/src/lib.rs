use proc_macro::TokenStream;
use quote::quote;
use syn::{
    parse_macro_input, ItemFn, Expr, Meta, Token,
    punctuated::Punctuated, parse::Parser,
};

#[proc_macro_attribute]
pub fn dtm_command(attr: TokenStream, item: TokenStream) -> TokenStream {
    let input = parse_macro_input!(item as ItemFn);

    let vis = &input.vis;
    let sig = &input.sig;
    let block = &input.block;
    let name = &sig.ident;

    // default behavior: just log name
    let mut ok_expr: Option<Expr> = None;

    if !attr.is_empty() {
        let parser = Punctuated::<Meta, Token![,]>::parse_terminated;
        let args = parser.parse(attr).unwrap();

        for meta in args {
            if let Meta::NameValue(nv) = meta {
                if nv.path.is_ident("ok") {
                    if let syn::Expr::Lit(lit) = nv.value {
                        panic!("ok expects expression/closure, not literal: {:?}", lit);
                    }
                    ok_expr = Some(nv.value);
                }
            }
        }
    }

    let ok_log = if let Some(expr) = ok_expr {
        quote! {
            let msg = (#expr)(&v);
            log::debug!("{} succeeded: {:?}", stringify!(#name), msg);
        }
    } else {
        quote! {
            log::debug!("{} succeeded", stringify!(#name));
        }
    };

    let expanded = quote! {
        #[tauri::command]
        #vis #sig {
            let __dtm_result = (async #block).await;

            match __dtm_result {
                Ok(v) => {
                    #ok_log
                    Ok(v)
                }
                Err(e) => {
                    log::error!("{} failed: {}", stringify!(#name), e);
                    Err(e)
                }
            }
        }
    };

    expanded.into()
}