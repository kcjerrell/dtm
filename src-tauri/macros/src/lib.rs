use proc_macro::TokenStream;
use quote::{format_ident, quote};
use syn::{
    Expr, FnArg, GenericArgument, ItemFn, Pat, PathArguments, ReturnType, Token, Type, parse::{Parse, ParseStream}, parse_macro_input
};

struct DtmArgs {
    ok_expr: Option<Expr>,
    err_expr: Option<Expr>,
}

impl Parse for DtmArgs {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let mut ok_expr = None;
        let mut err_expr = None;
        while !input.is_empty() {
            let id: syn::Ident = input.parse()?;
            if id == "ok" {
                input.parse::<Token![=]>()?;
                ok_expr = Some(input.parse()?);
            } else if id == "err" {
                input.parse::<Token![=]>()?;
                err_expr = Some(input.parse()?);
            } else {
                return Err(syn::Error::new(id.span(), "unknown attribute"));
            }
            if !input.is_empty() {
                input.parse::<Token![,]>()?;
            }
        }
        Ok(DtmArgs { ok_expr, err_expr })
    }
}

#[proc_macro_attribute]
pub fn dtm_command(args: TokenStream, input: TokenStream) -> TokenStream {
    let args = parse_macro_input!(args as DtmArgs);
    let item_fn = parse_macro_input!(input as ItemFn);

    let fn_name = &item_fn.sig.ident;
    let fn_name_str = fn_name.to_string();
    let visibility = &item_fn.vis;
    let signature = &item_fn.sig;
    let block = &item_fn.block;
    let inputs = &signature.inputs;

    let mut arg_names = Vec::new();
    let mut arg_types = Vec::new();
    for arg in inputs {
        if let FnArg::Typed(pat_type) = arg {
            if let Pat::Ident(pat_ident) = &*pat_type.pat {
                arg_names.push(&pat_ident.ident);
                arg_types.push(&pat_type.ty);
            }
        }
    }

    let mut success_type = quote! { _ };
    let mut error_type = quote! { _ };

    if let ReturnType::Type(_, ty) = &signature.output {
        if let Type::Path(tp) = &**ty {
            if let Some(last) = tp.path.segments.last() {
                if last.ident == "Result" {
                    if let PathArguments::AngleBracketed(args) = &last.arguments {
                        if args.args.len() >= 1 {
                            if let GenericArgument::Type(inner_ty) = &args.args[0] {
                                success_type = quote! { #inner_ty };
                            }
                        }
                        if args.args.len() >= 2 {
                            if let GenericArgument::Type(inner_ty) = &args.args[1] {
                                error_type = quote! { #inner_ty };
                            }
                        }
                    }
                }
            }
        }
    }

    let is_async = signature.asyncness.is_some();

    let body_invocation = if is_async {
        quote! {
            async { #block }.await
        }
    } else {
        quote! {
            (move || { #block })()
        }
    };

    let ok_log = if let Some(ok_expr) = &args.ok_expr {
        quote! {
            let ctx = OkCtx {
                #( #arg_names: &#arg_names, )*
                res: res,
            };
            let msg = {
                fn __dtm_ok_msg_wrapper(ctx: OkCtx, f: impl FnOnce(OkCtx) -> String) -> String {
                    f(ctx)
                }
                __dtm_ok_msg_wrapper(ctx, #ok_expr)
            };
            log::debug!("{}: {}", #fn_name_str, msg);
        }
    } else {
        quote! {
            log::debug!("{}: ok", #fn_name_str);
        }
    };

    let err_log = if let Some(err_expr) = &args.err_expr {
        quote! {
            let ctx = ErrCtx {
                #( #arg_names: &#arg_names, )*
                res: err,
            };
            let msg = {
                fn __dtm_err_msg_wrapper(ctx: ErrCtx, f: impl FnOnce(ErrCtx) -> String) -> String {
                    f(ctx)
                }
                __dtm_err_msg_wrapper(ctx, #err_expr)
            };
            log::error!("{}: {}", #fn_name_str, msg);
        }
    } else {
        quote! {
            log::error!("{}: error: {}", #fn_name_str, err);
        }
    };

    let ok_ctx_def = if args.ok_expr.is_some() {
        quote! {
            #[allow(dead_code)]
            struct OkCtx<'a> {
                #( #arg_names: &'a #arg_types, )*
                res: &'a #success_type,
            }
        }
    } else {
        quote! {}
    };

    let err_ctx_def = if args.err_expr.is_some() {
        quote! {
            #[allow(dead_code)]
            struct ErrCtx<'a> {
                #( #arg_names: &'a #arg_types, )*
                res: &'a #error_type,
            }
        }
    } else {
        quote! {}
    };

    let expanded = quote! {
        #[tauri::command]
        #visibility #signature {
            #ok_ctx_def
            #err_ctx_def

            let __res = #body_invocation;

            match &__res {
                Ok(res) => {
                    #ok_log
                }
                Err(err) => {
                    #err_log
                }
            }

            __res
        }
    };

    TokenStream::from(expanded)
}

#[proc_macro_attribute]
pub fn dtp_command(_attr: TokenStream, item: TokenStream) -> TokenStream {
    // This is now a marker macro when used inside #[dtp_commands]
    // If used alone, it will still try to generate, but will fail if inside an impl.
    // We'll keep the logic but allow it to be stripped by dtp_commands.
    item
}

#[proc_macro_attribute]
pub fn dtp_commands(_attr: TokenStream, item: TokenStream) -> TokenStream {
    let mut input = parse_macro_input!(item as syn::ItemImpl);
    let self_ty = &input.self_ty;

    let mut generated_commands = Vec::new();

    for item in &mut input.items {
        if let syn::ImplItem::Fn(method) = item {
            let mut has_dtp_command = false;
            let mut dtp_command_idx = None;

            for (i, attr) in method.attrs.iter().enumerate() {
                if attr.path().is_ident("dtp_command") {
                    has_dtp_command = true;
                    dtp_command_idx = Some(i);
                    break;
                }
            }

            if has_dtp_command {
                // Remove the dtp_command attribute from the method
                if let Some(idx) = dtp_command_idx {
                    method.attrs.remove(idx);
                }

                let vis = &method.vis;
                let sig = &method.sig;
                let fn_name = &sig.ident;

                // Ensure async
                if sig.asyncness.is_none() {
                    return syn::Error::new_spanned(
                        sig.fn_token,
                        "dtp_command functions must be async",
                    )
                    .to_compile_error()
                    .into();
                }

                // Extract args
                let mut inputs = sig.inputs.iter();

                // Ensure first arg is &self
                let first = inputs.next();
                match first {
                    Some(FnArg::Receiver(_)) => {}
                    _ => {
                        return syn::Error::new_spanned(
                            sig,
                            "dtp_command requires &self as first parameter",
                        )
                        .to_compile_error()
                        .into();
                    }
                }

                // Collect remaining args for wrapper
                let mut wrapper_args = Vec::new();
                let mut forward_args = Vec::new();

                for arg in inputs {
                    if let FnArg::Typed(pat_type) = arg {
                        wrapper_args.push(pat_type.clone());

                        // extract argument name for forwarding
                        if let Pat::Ident(pat_ident) = &*pat_type.pat {
                            forward_args.push(pat_ident.ident.clone());
                        }
                    }
                }

                let output = &sig.output;
                let wrapper_name = format_ident!("dtp_{}", fn_name);
                let command_name_str = wrapper_name.to_string();

                generated_commands.push(quote! {
                    #[tauri::command]
                    #vis async fn #wrapper_name(
                        state: tauri::State<'_, #self_ty>,
                        #(#wrapper_args),*
                    ) #output {
                        log::debug!("DTPService command: {}", #command_name_str);

                        let result = state.inner().#fn_name(#(#forward_args),*).await;

                        if let Err(ref e) = result {
                            log::error!(
                                "DTPService command failed: {} ({})",
                                #command_name_str,
                                e
                            );
                        }

                        result
                    }
                });
            }
        }
    }

    let expanded = quote! {
        #input

        #(#generated_commands)*
    };

    expanded.into()
}