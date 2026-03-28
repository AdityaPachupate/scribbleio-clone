using scribble.API.Hubs;
using scribble.API.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddSignalR();
builder.Services.AddSingleton<GameManager>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        policy => policy
            .WithOrigins(
                "https://scribbleio-clone-nv7f.vercel.app",  // production frontend
                "http://localhost:4200"                   // local dev
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());  // Required for SignalR
});


var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// app.UseHttpsRedirection();
app.UseCors("AllowAll");

app.UseAuthorization();

app.MapControllers();
app.MapHub<GameHub>("/gamehub");

app.MapGet("/health", () => Results.Ok("Healthy"));

app.Run();
