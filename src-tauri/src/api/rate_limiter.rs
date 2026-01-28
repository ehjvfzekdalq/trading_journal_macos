use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter as GovernorRateLimiter,
};
use std::num::NonZeroU32;
use std::time::Duration;

use super::client::RateLimitConfig;

/// Rate limiter wrapper using token bucket algorithm
pub struct RateLimiter {
    limiter: GovernorRateLimiter<NotKeyed, InMemoryState, DefaultClock>,
}

impl RateLimiter {
    /// Create a new rate limiter from configuration
    pub fn new(config: RateLimitConfig) -> Self {
        let per_second = NonZeroU32::new(config.requests_per_second)
            .unwrap_or(NonZeroU32::new(1).unwrap());
        let burst = NonZeroU32::new(config.burst_size)
            .unwrap_or(NonZeroU32::new(config.requests_per_second).unwrap());

        let quota = Quota::per_second(per_second).allow_burst(burst);
        let limiter = GovernorRateLimiter::direct(quota);

        Self { limiter }
    }

    /// Wait until a request can be made (blocking)
    pub async fn acquire(&self) {
        while self.limiter.check().is_err() {
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }

    /// Try to acquire a token without blocking
    pub fn try_acquire(&self) -> bool {
        self.limiter.check().is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter_allows_burst() {
        let config = RateLimitConfig {
            requests_per_second: 10,
            burst_size: 5,
        };
        let limiter = RateLimiter::new(config);

        // Should allow burst of 5 immediately
        for _ in 0..5 {
            assert!(limiter.try_acquire());
        }
    }

    #[tokio::test]
    async fn test_rate_limiter_blocks_after_burst() {
        let config = RateLimitConfig {
            requests_per_second: 10,
            burst_size: 2,
        };
        let limiter = RateLimiter::new(config);

        // Consume burst
        assert!(limiter.try_acquire());
        assert!(limiter.try_acquire());

        // Next should fail (no blocking)
        assert!(!limiter.try_acquire());
    }

    #[tokio::test]
    async fn test_rate_limiter_acquire_waits() {
        let config = RateLimitConfig {
            requests_per_second: 10,
            burst_size: 1,
        };
        let limiter = RateLimiter::new(config);

        // First should succeed
        limiter.acquire().await;

        // Second should wait but eventually succeed
        let start = std::time::Instant::now();
        limiter.acquire().await;
        let elapsed = start.elapsed();

        // Should have waited at least some time (governor refills tokens)
        assert!(elapsed.as_millis() > 50);
    }
}
