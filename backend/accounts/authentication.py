from rest_framework.authentication import BaseAuthentication


class LoginAuthentication(BaseAuthentication):

    def authenticate(self, request):
        return None

    def authenticate_header(self, request):
        return "Bearer"