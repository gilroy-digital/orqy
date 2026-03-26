pub mod routes;
pub mod ws;

use crate::deploy::DeployBroadcaster;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub broadcaster: DeployBroadcaster,
    pub encryption_key: [u8; 32],
}
