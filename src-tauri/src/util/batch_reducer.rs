use anyhow::Result;
use std::{future::Future, pin::Pin};

type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T>> + Send + 'a>>;

pub struct BatchReducer<T, V, R> {
    items: Vec<T>,
    reducer: R,
    current_value: Option<V>,
    batch_size: usize,
}

impl<T, V, R> BatchReducer<T, V, R>
where
    R: for<'a> Fn(&'a [T], V) -> BoxFuture<'a, V> + Send + Sync,
{
    pub fn new(reducer: R, initial_value: V, batch_size: usize) -> Self {
        Self {
            items: Vec::new(),
            reducer,
            current_value: Some(initial_value),
            batch_size,
        }
    }

    pub async fn add(&mut self, item: T) -> Result<()> {
        self.items.push(item);
        if self.items.len() >= self.batch_size {
            self.reduce().await?;
        }
        Ok(())
    }

    async fn reduce(&mut self) -> Result<()> {
        let current = self.current_value.take().unwrap();
        let new_value = (self.reducer)(&self.items, current).await?;
        self.current_value = Some(new_value);
        self.items.clear();
        Ok(())
    }

    pub async fn finish(mut self) -> Result<V> {
        if !self.items.is_empty() {
            self.reduce().await?;
        }
        Ok(self.current_value.unwrap())
    }
}
