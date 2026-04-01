use spacetimedb::{ReducerContext, Table};

#[spacetimedb::table(accessor = user, public)]
pub struct User {
    #[primary_key]
    username: String,
    password: String,
}

#[spacetimedb::reducer(init)]
pub fn init(_ctx: &ReducerContext) {
    // Called when the module is initially published
}

#[spacetimedb::reducer(client_connected)]
pub fn identity_connected(_ctx: &ReducerContext) {
    // Called everytime a new client connects
}

#[spacetimedb::reducer(client_disconnected)]
pub fn identity_disconnected(_ctx: &ReducerContext) {
    // Called everytime a client disconnects
}

#[spacetimedb::reducer]
pub fn register_user(
    ctx: &ReducerContext,
    username: String,
    password: String,
    repeat_password: String,
) -> Result<(), String> {
    if username.trim().is_empty() {
        return Err("Username is required".to_string());
    }

    if password.is_empty() {
        return Err("Password is required".to_string());
    }

    if password != repeat_password {
        return Err("Passwords do not match".to_string());
    }

    if ctx.db.user().username().find(&username).is_some() {
        return Err("Username is already taken".to_string());
    }

    ctx.db.user().insert(User { username, password });
    Ok(())
}

#[spacetimedb::reducer]
pub fn login_user(ctx: &ReducerContext, username: String, password: String) -> Result<(), String> {
    if username.trim().is_empty() || password.is_empty() {
        return Err("Username and password are required".to_string());
    }

    let user = ctx
        .db
        .user()
        .username()
        .find(&username)
        .ok_or_else(|| "Invalid username or password".to_string())?;

    if user.password != password {
        return Err("Invalid username or password".to_string());
    }

    Ok(())
}
