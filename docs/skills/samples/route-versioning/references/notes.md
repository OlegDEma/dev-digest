# Why versioning by addition

Renaming a route in place means every client bundle already shipped breaks at
the moment of deploy. Adding the new route beside the old one lets clients
move on their own schedule and lets the server measure when the old one is
finally unused.
