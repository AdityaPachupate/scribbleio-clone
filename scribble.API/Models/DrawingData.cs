namespace scribble.API.Models
{
    public class DrawingData
    {
        public double X { get; set; }

        // Current Y position
        public double Y { get; set; }

        // Previous X position (to draw lines)
        public double PrevX { get; set; }

        // Previous Y position
        public double PrevY { get; set; }

        // Color in hex format (e.g., "#FF0000" for red)
        public string Color { get; set; } = "#000000";

        // Brush size in pixels
        public int LineWidth { get; set; } = 2;

        // What action? "draw" or "clear"
        public string Action { get; set; } = "draw";
    }
}
