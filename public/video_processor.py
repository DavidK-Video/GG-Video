import os
from moviepy.editor import VideoFileClip, concatenate_videoclips
import argparse

def concatenate_videos(video_list, output_filename="final_video.mp4"):
    """
    Concatenates a list of video files into a single video.
    
    Args:
        video_list (list): List of paths to video files.
        output_filename (str): The name of the output video file.
    """
    clips = []
    try:
        # Load each video clip from the list
        for video in video_list:
            if os.path.exists(video):
                clips.append(VideoFileClip(video))
            else:
                print(f"Warning: File not found - {video}")
        
        if not clips:
            print("Error: No valid video clips found to concatenate.")
            return

        # Concatenate all clips
        final_clip = concatenate_videoclips(clips, method="compose")
        
        # Write the result to a file
        final_clip.write_videofile(output_filename, codec="libx264", audio_codec="aac")
        
        # Close clips to release resources
        for clip in clips:
            clip.close()
            
        print(f"Success: Video saved as {output_filename}")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Concatenate multiple videos into one.")
    parser.add_argument("videos", nargs="+", help="List of video files to concatenate")
    parser.add_argument("-o", "--output", default="joined_video.mp4", help="Output filename")
    
    args = parser.parse_args()
    concatenate_videos(args.videos, args.output)
