package app.vercel.kutubi.twa;
import android.content.pm.ActivityInfo;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
@CapacitorPlugin(name="ReadingRotation")
public class ReadingRotationPlugin extends Plugin {
 @PluginMethod public void setLocked(PluginCall call) {
  boolean locked=Boolean.TRUE.equals(call.getBoolean("locked",false));
  getActivity().runOnUiThread(()->{
   getActivity().setRequestedOrientation(locked?ActivityInfo.SCREEN_ORIENTATION_LOCKED:ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
   call.resolve();
  });
 }
}
